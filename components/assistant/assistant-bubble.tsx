'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  isToolUIPart,
  getToolName,
  type UIMessage,
  type ToolUIPart,
  type DynamicToolUIPart,
} from 'ai';
import {
  MessageCircle,
  X,
  Send,
  Plus,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';

const STORAGE_KEY = 'rr-assistant-thread-id';

const TOOL_LABELS: Record<string, string> = {
  search_collections: 'Searching collections',
  list_collections: 'Listing collections',
  get_collection_info: 'Looking up collection',
  find_records: 'Searching records',
  get_record: 'Fetching record',
  get_related_records: 'Finding related records',
  list_my_bookmarks: 'Reading your bookmarks',
};

function inputSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const values = Object.values(input as Record<string, unknown>)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, 2);
  if (values.length === 0) return '';
  return values.map((v) => `“${v.length > 30 ? v.slice(0, 27) + '…' : v}”`).join(' · ');
}

function MarkdownText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="leading-relaxed [&:not(:last-child)]:mb-2">{children}</p>
        ),
        a: ({ href, children }) => {
          if (!href) return <>{children}</>;
          const isInternal = href.startsWith('/') && !href.startsWith('//');
          const className =
            'text-brand-gold hover:text-brand-gold-light underline underline-offset-2 decoration-brand-gold/40 hover:decoration-brand-gold break-words';
          return isInternal ? (
            <Link href={href} className={className}>
              {children}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
              {children}
            </a>
          );
        },
        ul: ({ children }) => (
          <ul className="list-disc list-outside pl-5 space-y-1 [&:not(:last-child)]:mb-2">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside pl-5 space-y-1 [&:not(:last-child)]:mb-2">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-brand-cream">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => (
          <h3 className="font-display text-base font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h3 className="font-display text-sm font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h4 className="font-display text-sm font-semibold text-brand-cream mt-1 mb-1">
            {children}
          </h4>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-brand-gold/30 pl-3 text-brand-muted [&:not(:last-child)]:mb-2">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="bg-brand-bg/60 border border-brand-gold/[0.08] px-1 py-0.5 rounded text-[12px] font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-brand-bg/60 border border-brand-gold/[0.08] rounded-lg p-2 overflow-x-auto text-[12px] font-mono [&:not(:last-child)]:mb-2 [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0">
            {children}
          </pre>
        ),
        hr: () => <hr className="border-brand-gold/[0.08] my-2" />,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function ToolCard({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const state = part.state;
  const busy = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';
  const summary = inputSummary(part.input);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-brand-muted bg-brand-card/60 border border-brand-gold/[0.08] rounded-lg">
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin text-brand-gold flex-shrink-0" />
      ) : failed ? (
        <AlertCircle className="w-3 h-3 text-brand-burgundy flex-shrink-0" />
      ) : (
        <Check className="w-3 h-3 text-brand-gold flex-shrink-0" />
      )}
      <span className="truncate">
        <span className="text-brand-cream-muted">{label}</span>
        {summary && <span className="ml-1">{summary}</span>}
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const parts = message.parts ?? [];
  // Skip rendering an empty assistant message (no text or tool activity yet).
  const renderable = parts.filter(
    (p) =>
      (p.type === 'text' && p.text.length > 0) || isToolUIPart(p),
  );
  if (renderable.length === 0) return null;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] space-y-1.5">
        {renderable.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div
                key={i}
                className={`rounded-2xl px-3 py-2 text-sm break-words ${
                  isUser
                    ? 'bg-brand-gold/[0.12] text-brand-cream border border-brand-gold/20 leading-relaxed whitespace-pre-wrap'
                    : 'bg-brand-card text-brand-cream border border-brand-gold/[0.06]'
                }`}
              >
                {isUser ? part.text : <MarkdownText text={part.text} />}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return <ToolCard key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

interface ChatProps {
  threadId: string;
  initialMessages: UIMessage[];
  onClose: () => void;
  onNewChat: () => void;
}

function Chat({ threadId, initialMessages, onClose, onNewChat }: ChatProps) {
  const [input, setInput] = useState('');

  // Stable transport — useChat handles the rest, and the body shape lines up
  // with the chat route's expectation of `{ message, id }`.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant/chat',
        prepareSendMessagesRequest({ messages, id }) {
          return { body: { message: messages[messages.length - 1], id } };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const send = () => {
    const text = input.trim();
    if (!text || status !== 'ready') return;
    sendMessage({ text });
    setInput('');
  };

  const busy = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.08] flex-shrink-0">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-brand-cream">
            Research Assistant
          </p>
          <p className="text-[11px] text-brand-muted truncate">
            Reparation Road archive
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onNewChat}
            className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-gold transition-colors"
            title="New conversation"
            aria-label="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-cream transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Message list */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="text-center py-10 px-4">
            <MessageCircle className="w-7 h-7 text-brand-gold/40 mx-auto mb-3" />
            <p className="text-xs text-brand-muted leading-relaxed">
              Ask anything about the archive — collections, records, how to
              research a name, or how to use the site.
            </p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {status === 'submitted' && (
          <div className="flex items-center gap-2 px-1 text-xs text-brand-muted">
            <Loader2 className="w-3 h-3 animate-spin text-brand-gold" />
            Thinking…
          </div>
        )}
        {error && (
          <div className="text-xs text-brand-burgundy-light bg-brand-burgundy/10 border border-brand-burgundy/20 rounded-lg px-3 py-2">
            Something went wrong. Please try again.
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 px-3 py-3 border-t border-brand-gold/[0.08] flex-shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the archive…"
          disabled={busy}
          className="flex-1 bg-brand-card border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30 disabled:opacity-60"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="px-3 rounded-xl bg-brand-card border border-brand-gold/15 text-brand-muted hover:text-brand-cream transition-colors"
            title="Stop"
            aria-label="Stop"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light disabled:opacity-40 transition-colors"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
}

/**
 * Floating chat bubble — the entry point for the assistant on any platform
 * (signed-in) page. The current thread id lives in localStorage so the
 * conversation persists across page navigations and refreshes.
 */
export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );

  // Bootstrap a thread id on first mount; reused across sessions.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setThreadId(stored);
    } else {
      const fresh = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, fresh);
      setThreadId(fresh);
    }
  }, []);

  // Load the thread's history whenever the active thread changes.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setInitialMessages(null);
    fetch(`/api/assistant/threads/${threadId}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data: {
        messages?: Array<{
          id: string;
          role: string;
          content?: string;
          parts?: UIMessage['parts'];
        }>;
      }) => {
        if (cancelled) return;
        const msgs: UIMessage[] = (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as UIMessage['role'],
          parts: m.parts ?? [{ type: 'text', text: m.content ?? '' }],
        }));
        setInitialMessages(msgs);
      })
      .catch(() => {
        if (!cancelled) setInitialMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const handleNewChat = () => {
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    setThreadId(fresh);
    setInitialMessages([]);
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close research assistant' : 'Open research assistant'}
        className="fixed bottom-6 right-6 z-40 p-3.5 rounded-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light shadow-2xl transition-transform hover:scale-105"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-7rem)] bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {threadId && initialMessages !== null ? (
            <Chat
              key={threadId}
              threadId={threadId}
              initialMessages={initialMessages}
              onClose={() => setOpen(false)}
              onNewChat={handleNewChat}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
