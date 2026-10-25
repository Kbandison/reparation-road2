'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AllowanceView, CapRefusal, ChatEvent, ChatMessage, ChatPart } from '@/lib/assistant/types';

export type ChatStatus = 'ready' | 'submitted' | 'streaming';

interface Options {
  threadId: string;
  initialMessages: ChatMessage[];
  /** After each finished answer, e.g. to refresh the thread list. */
  onFinish?: () => void;
}

/** Applies one streamed event to the answer being built. */
function applyEvent(parts: ChatPart[], event: ChatEvent): ChatPart[] {
  if (event.type === 'text') {
    const last = parts[parts.length - 1];
    if (last?.type === 'text') return [...parts.slice(0, -1), { ...last, text: last.text + event.text }];
    return [...parts, { type: 'text', text: event.text }];
  }
  if (event.type === 'tool-start') {
    return [...parts, { type: 'tool', id: event.id, name: event.name, input: event.input, state: 'running' }];
  }
  if (event.type === 'tool-end') {
    return parts.map((p) =>
      p.type === 'tool' && p.id === event.id ? { ...p, state: event.error ? 'error' : 'done', output: event.output } : p,
    );
  }
  return parts;
}

/**
 * The assistant conversation in a thread: sends questions to
 * /api/assistant/chat and builds the answer from its streamed events.
 */
export function useAssistantChat({ threadId, initialMessages, onFinish }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState<ChatStatus>('ready');
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<CapRefusal | null>(null);
  const [allowance, setAllowance] = useState<AllowanceView | null>(null);
  const abort = useRef<AbortController | null>(null);

  // How much they've used, so the chat can say what's left before they ask.
  useEffect(() => {
    let active = true;
    void fetch('/api/assistant/usage')
      .then((res) => (res.ok ? (res.json() as Promise<AllowanceView>) : null))
      .then((a) => {
        if (active && a) setAllowance(a);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || status !== 'ready') return;
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: question }] };
      setMessages((prev) => [...prev, userMessage]);
      setStatus('submitted');
      setError(null);
      setRefusal(null);

      const controller = new AbortController();
      abort.current = controller;
      let answerId: string | null = null;

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, text: question }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as Partial<CapRefusal> & { error?: string };
          if (res.status === 429 && data.reason && data.allowance) {
            // Refused for a cap: the question wasn't asked, so take it back out.
            setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
            setRefusal(data as CapRefusal);
            setAllowance(data.allowance);
          } else {
            setError(data.error ?? 'Something went wrong. Please try again.');
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatEvent;
            if (event.type === 'start') {
              const id = event.messageId;
              answerId = id;
              setStatus('streaming');
              setMessages((prev) => [...prev, { id, role: 'assistant', parts: [] }]);
            } else if (event.type === 'done') {
              setAllowance(event.allowance);
            } else if (event.type === 'error') {
              setError(event.message);
            } else if (answerId) {
              const id = answerId;
              setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, parts: applyEvent(m.parts, event) } : m)));
            }
          }
        }
        onFinish?.();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Lost the connection. Please try again.');
      } finally {
        abort.current = null;
        setStatus('ready');
      }
    },
    [status, threadId, onFinish],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  return { messages, sendMessage, status, stop, error, refusal, allowance };
}
