'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  MessageSquare,
  AtSign,
  ArrowBigUp,
  UserPlus,
  Mail,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

interface Notification {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actorName: string;
  actorHandle: string | null;
  threadTitle: string | null;
  threadSlug: string | null;
  conversationId: string | null;
}

const ICON: Record<string, typeof Bell> = {
  reply: MessageSquare,
  reaction: MessageSquare,
  mention: AtSign,
  vote: ArrowBigUp,
  follow: UserPlus,
  message: Mail,
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
    case 'reaction':
      return 'reacted to';
    case 'message':
      return 'sent you a message';
    default:
      return 'did something on';
  }
}

/** Where clicking a notification should take you. */
function target(n: Notification): string {
  if (n.type === 'message') return '/dashboard';
  if (n.type === 'follow') return n.actorHandle ? `/forum/u/${n.actorHandle}` : '/forum';
  return n.threadSlug ? `/forum/thread/${n.threadSlug}` : '/forum/notifications';
}

function ago(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Notifications, as a side-opening panel inside the profile menu.
 *
 * Previously they lived on their own page that you had to know about and
 * navigate to, which meant a reply could sit unseen indefinitely. Nesting them
 * under the avatar puts them where people already look, without spending a
 * second slot in the top bar on a bell.
 *
 * Loads only when opened. The nav renders on every page, and most page loads
 * are not someone checking their notifications.
 */
export function NotificationsMenu({
  unreadCount,
  onRead,
}: {
  unreadCount: number;
  /** Lets the nav clear the dot on the avatar once these are seen. */
  onRead: () => void;
}) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);

  // Fetching on open is an event, not a synchronisation — doing it in an effect
  // would setState during render for no benefit.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && items === null) load();
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/forum/notifications?limit=8');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);

      // Opening the panel is what counts as seeing them.
      if ((data.unread ?? 0) > 0) {
        await fetch('/api/forum/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        onRead();
      }
    } catch {
      setItems([]);
    }
  }, [onRead]);

  return (
    <DropdownMenuSub open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuSubTrigger className="text-brand-cream">
        <Bell className="w-4 h-4 mr-2" />
        Notifications
        {unreadCount > 0 && (
          <span className="ml-auto mr-1 min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full bg-brand-gold text-brand-bg text-[10px] font-semibold tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuSubTrigger>

      <DropdownMenuSubContent className="w-80 bg-brand-card border-brand-gold/[0.08] p-0">
        {items === null ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-brand-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading&hellip;
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-brand-muted">
            Nothing yet. Replies, mentions and messages from other researchers
            will appear here.
          </p>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto">
              {items.map((n) => {
                const Icon = ICON[n.type] ?? Bell;
                return (
                  <Link
                    key={n.id}
                    href={target(n)}
                    className={`flex gap-2.5 px-3 py-2.5 border-b border-brand-gold/[0.06] last:border-b-0 hover:bg-brand-card-hover transition-colors ${
                      n.is_read ? '' : 'bg-brand-gold/[0.04]'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm text-brand-cream leading-snug">
                        <strong className="font-medium">{n.actorName}</strong>{' '}
                        {verb(n.type)}
                        {n.threadTitle && (
                          <span className="text-brand-muted"> {n.threadTitle}</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-brand-muted mt-0.5">
                        {ago(n.created_at)}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <Link
              href="/forum/notifications"
              className="block px-3 py-2.5 text-xs text-brand-gold hover:text-brand-gold-light border-t border-brand-gold/[0.08]"
            >
              See all notifications
            </Link>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
