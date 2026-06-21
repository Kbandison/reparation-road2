import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Bell, ArrowBigUp, MessageSquare, AtSign, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

export const metadata: Metadata = { title: 'Notifications — Community' };

const ICONS: Record<string, typeof Bell> = {
  reply: MessageSquare,
  mention: AtSign,
  vote: ArrowBigUp,
  follow: UserPlus,
  reaction: MessageSquare,
};

function verb(type: string): string {
  switch (type) {
    case 'reply': return 'replied to';
    case 'mention': return 'mentioned you in';
    case 'vote': return 'upvoted';
    case 'follow': return 'started following you';
    default: return 'interacted with';
  }
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await supabase
    .from('forum_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(80);
  const notifs = rows ?? [];

  // Mark all read on view.
  if (notifs.some((n) => !n.is_read)) {
    await supabase.from('forum_notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  }

  const admin = createAdminClient();
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))];
  const threadIds = [...new Set(notifs.map((n) => n.thread_id).filter(Boolean))];
  const [{ data: actors }, { data: threads }] = await Promise.all([
    actorIds.length ? admin.from('profiles').select('id, display_name, first_name, last_name, handle').in('id', actorIds) : Promise.resolve({ data: [] }),
    threadIds.length ? admin.from('forum_threads').select('id, title, slug').in('id', threadIds) : Promise.resolve({ data: [] }),
  ]);
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a]));
  const threadMap = new Map((threads ?? []).map((t) => [t.id, t]));

  return (
    <>
      <div className="mb-2">
        <Link href="/forum" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          ← Community Feed
        </Link>
      </div>
      <PageHeader eyebrow="Community" title="Notifications" />

      {notifs.length === 0 ? (
        <p className="text-sm text-brand-muted">No notifications yet. Join a conversation to get started.</p>
      ) : (
        <div className="space-y-2">
          {notifs.map((n) => {
            const a = actorMap.get(n.actor_id);
            const t = threadMap.get(n.thread_id);
            const actorName =
              a?.display_name?.trim() || `${a?.first_name ?? ''} ${a?.last_name ?? ''}`.trim() || a?.handle || 'Someone';
            const Icon = ICONS[n.type] ?? Bell;
            const href = t?.slug ? `/forum/thread/${t.slug}` : a?.handle ? `/forum/u/${a.handle}` : '#';
            return (
              <Link
                key={n.id}
                href={href}
                className="flex items-start gap-3 bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 hover:border-brand-gold/25 transition-colors"
              >
                <Icon className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-brand-cream">
                    <span className="font-medium">{actorName}</span> {verb(n.type)}
                    {t?.title && <span className="text-brand-muted"> {t.title}</span>}
                  </p>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
