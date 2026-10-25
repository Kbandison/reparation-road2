'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, X, Plus, Loader2, Maximize2 } from 'lucide-react';
import type { ChatMessage } from '@/lib/assistant/types';
import { AssistantChat } from '@/components/assistant/assistant-chat';

const STORAGE_KEY = 'rr-assistant-thread-id';

/** This browser's current thread, created and remembered on first use. */
function rememberedThreadId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Storage blocked: fall through to a thread for this visit only.
  }
  const fresh = crypto.randomUUID();
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Same as above.
  }
  return fresh;
}

interface BubbleChatProps {
  threadId: string;
  initialMessages: ChatMessage[];
  onClose: () => void;
  onNewChat: () => void;
}

function BubbleChat({
  threadId,
  initialMessages,
  onClose,
  onNewChat,
}: BubbleChatProps) {
  return (
    <AssistantChat
      threadId={threadId}
      initialMessages={initialMessages}
      compactEmpty
      header={
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
            <Link
              href={`/assistant?t=${threadId}`}
              className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-gold transition-colors"
              title="Open in full view"
              aria-label="Open in full view"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>
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
      }
    />
  );
}

/**
 * Floating chat bubble — the entry point for the assistant on every signed-in
 * page. The current thread id lives in localStorage so the conversation
 * persists across pages and reloads.
 */
export function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | null>(null);

  // The thread is picked when the bubble first opens: the one saved in this
  // browser, or a new one. (Not on mount: the server render has no localStorage.)
  const toggle = () => {
    if (!open && !threadId) setThreadId(rememberedThreadId());
    setOpen((o) => !o);
  };

  // Load the thread's history whenever the active thread changes.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    fetch(`/api/assistant/threads/${threadId}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data: { messages?: ChatMessage[] }) => {
        if (!cancelled) setInitialMessages(data.messages ?? []);
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
    try {
      localStorage.setItem(STORAGE_KEY, fresh);
    } catch {
      // Private browsing: the new thread just won't survive a reload.
    }
    setInitialMessages([]);
    setThreadId(fresh);
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          open ? 'Close research assistant' : 'Open research assistant'
        }
        className="fixed bottom-6 right-6 z-40 p-3.5 rounded-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light shadow-2xl transition-transform hover:scale-105"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="
            fixed z-40 bg-brand-bg shadow-2xl flex flex-col overflow-hidden
            inset-0 rounded-none border-0
            lg:inset-auto lg:bottom-24 lg:right-6
            lg:w-[380px] lg:max-w-[calc(100vw-2rem)]
            lg:h-[560px] lg:max-h-[calc(100vh-7rem)]
            lg:rounded-2xl lg:border lg:border-brand-gold/[0.12]
          "
          style={{
            // Respect iOS safe-areas when the panel goes edge-to-edge on phones.
            paddingTop: 'env(safe-area-inset-top, 0)',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}
        >
          {threadId && initialMessages !== null ? (
            <BubbleChat
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
