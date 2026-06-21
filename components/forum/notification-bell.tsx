'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, ArrowBigUp, MessageSquare, AtSign, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actorName: string;
  actorHandle: string | null;
  threadTitle: string | null;
  threadSlug: string | null;
}

const ICONS: Record<string, typeof Bell> = {
  reply: MessageSquare,
  mention: AtSign,
  vote: ArrowBigUp,
  follow: UserPlus,
  reaction: MessageSquare,
};

function verb(type: string): string {
  switch (type) {
    case 'reply':
      return 'replied to';
    case 'mention':
      return 'mentioned you in';
    case 'vote':
      return 'upvoted';
    case 'follow':
      return 'started following you';
    default:
      return 'interacted with';
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Initial load + light polling so the badge updates without a refresh.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/forum/notifications');
        const data = await res.json();
        if (!active) return;
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      } catch {
        // ignore
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await fetch('/api/forum/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-gold text-brand-bg text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-brand-gold/15 bg-brand-card shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.08]">
            <p className="text-sm font-semibold text-brand-cream">Notifications</p>
            <Link href="/forum/notifications" className="text-xs text-brand-gold" onClick={() => setOpen(false)}>
              See all
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-8">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-brand-gold/[0.05]">
              {items.slice(0, 12).map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                const href = n.threadSlug ? `/forum/thread/${n.threadSlug}` : n.actorHandle ? `/forum/u/${n.actorHandle}` : '#';
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`flex items-start gap-2.5 px-4 py-3 hover:bg-brand-card-hover transition-colors ${n.is_read ? '' : 'bg-brand-gold/[0.04]'}`}
                    >
                      <Icon className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-brand-cream leading-snug">
                          <span className="font-medium">{n.actorName}</span> {verb(n.type)}
                          {n.threadTitle && <span className="text-brand-muted"> {n.threadTitle}</span>}
                        </p>
                        <p className="text-[11px] text-brand-muted mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
