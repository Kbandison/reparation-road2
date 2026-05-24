'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Menu, X, MessageCircle, Loader2 } from 'lucide-react';
import { AssistantChat } from '@/components/assistant/assistant-chat';
import type { UIMessage } from 'ai';

interface ThreadSummary {
  id: string;
  title: string;
  updated_at: string;
}

interface AssistantPageShellProps {
  threads: ThreadSummary[];
  activeThreadId: string;
  activeTitle: string;
  activeExists: boolean;
  initialMessages: UIMessage[];
}

export function AssistantPageShell({
  threads,
  activeThreadId,
  activeTitle,
  activeExists,
  initialMessages,
}: AssistantPageShellProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // If the active thread isn't yet persisted, prepend a synthetic entry so
  // the sidebar always reflects where the user is.
  const displayThreads: ThreadSummary[] = activeExists
    ? threads
    : [
        {
          id: activeThreadId,
          title: 'New conversation',
          updated_at: new Date().toISOString(),
        },
        ...threads,
      ];

  const handleNewChat = () => {
    const fresh = crypto.randomUUID();
    setDrawerOpen(false);
    router.push(`/assistant?t=${fresh}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    setDeleting(id);
    const res = await fetch(`/api/assistant/threads/${id}`, {
      method: 'DELETE',
    });
    setDeleting(null);
    if (!res.ok) return;
    if (id === activeThreadId) {
      const next = threads.find((t) => t.id !== id);
      router.push(next ? `/assistant?t=${next.id}` : '/assistant');
    } else {
      router.refresh();
    }
  };

  const renderThreadList = (onPick?: () => void) => (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-3 border-b border-brand-gold/[0.08] flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            onPick?.();
            handleNewChat();
          }}
          className="w-full flex items-center justify-center gap-2 bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {displayThreads.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-6 px-3">
            Your conversations will show up here.
          </p>
        ) : (
          displayThreads.map((t) => {
            const isActive = t.id === activeThreadId;
            const persisted = !(t.id === activeThreadId && !activeExists);
            return (
              <div
                key={t.id}
                className={`group relative rounded-lg ${
                  isActive
                    ? 'bg-brand-gold/[0.08]'
                    : 'hover:bg-brand-card-hover/50'
                }`}
              >
                <Link
                  href={`/assistant?t=${t.id}`}
                  onClick={onPick}
                  className={`block px-3 py-2 pr-9 text-sm rounded-lg truncate ${
                    isActive
                      ? 'text-brand-cream font-medium'
                      : 'text-brand-cream-muted hover:text-brand-cream'
                  }`}
                  title={t.title}
                >
                  {t.title}
                </Link>
                {persisted && (
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    disabled={deleting === t.id}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-brand-muted opacity-0 group-hover:opacity-100 hover:bg-brand-card hover:text-brand-burgundy transition-all disabled:opacity-40"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    {deleting === t.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] lg:h-[calc(100vh-10rem)]">
      {/* Mobile: open-drawer button */}
      <div className="lg:hidden flex items-center justify-between mb-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 text-sm text-brand-cream-muted hover:text-brand-cream"
        >
          <Menu className="w-4 h-4" />
          Conversations
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex lg:w-72 lg:flex-shrink-0 bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
          {renderThreadList()}
        </aside>

        {/* Sidebar — mobile drawer */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-30 flex">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative w-80 max-w-[calc(100vw-3rem)] h-full bg-brand-bg border-r border-brand-gold/[0.12] flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-brand-gold/[0.08] flex-shrink-0">
                <p className="text-sm font-medium text-brand-cream">
                  Conversations
                </p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-cream"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex">
                {renderThreadList(() => setDrawerOpen(false))}
              </div>
            </div>
          </div>
        )}

        {/* Chat column */}
        <div className="flex-1 flex flex-col bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden min-h-0">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-brand-gold/[0.08] flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-brand-gold flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-brand-cream truncate">
                {activeTitle}
              </p>
              <p className="text-[11px] text-brand-muted">
                Research Assistant
              </p>
            </div>
          </header>
          <AssistantChat
            key={activeThreadId}
            threadId={activeThreadId}
            initialMessages={initialMessages}
            onFinish={() => router.refresh()}
          />
        </div>
      </div>
    </div>
  );
}
