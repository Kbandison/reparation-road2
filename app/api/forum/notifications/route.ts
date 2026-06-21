import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface EnrichedNotification {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actorName: string;
  actorHandle: string | null;
  threadTitle: string | null;
  threadSlug: string | null;
}

// GET — the viewer's notifications (most recent first) + unread count.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(50, parseInt(new URL(request.url).searchParams.get('limit') || '20', 10) || 20);

  const { data: rows, error } = await supabase
    .from('forum_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Pre-migration / missing table → empty, not an error.
  if (error) return NextResponse.json({ notifications: [], unread: 0 });

  const notifs = rows ?? [];
  const { count: unread } = await supabase
    .from('forum_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  // Enrich with actor name + thread title/slug via the admin client.
  const admin = createAdminClient();
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))];
  const threadIds = [...new Set(notifs.map((n) => n.thread_id).filter(Boolean))];

  const [{ data: actors }, { data: threads }] = await Promise.all([
    actorIds.length
      ? admin.from('profiles').select('id, display_name, first_name, last_name, handle').in('id', actorIds)
      : Promise.resolve({ data: [] }),
    threadIds.length
      ? admin.from('forum_threads').select('id, title, slug').in('id', threadIds)
      : Promise.resolve({ data: [] }),
  ]);

  const actorMap = new Map((actors ?? []).map((a) => [a.id, a]));
  const threadMap = new Map((threads ?? []).map((t) => [t.id, t]));

  const enriched: EnrichedNotification[] = notifs.map((n) => {
    const a = actorMap.get(n.actor_id);
    const t = threadMap.get(n.thread_id);
    const actorName =
      a?.display_name?.trim() ||
      `${a?.first_name ?? ''} ${a?.last_name ?? ''}`.trim() ||
      a?.handle ||
      'Someone';
    return {
      id: n.id,
      type: n.type,
      is_read: n.is_read,
      created_at: n.created_at,
      actorName,
      actorHandle: a?.handle ?? null,
      threadTitle: t?.title ?? null,
      threadSlug: t?.slug ?? null,
    };
  });

  return NextResponse.json({ notifications: enriched, unread: unread ?? 0 });
}

// PATCH — mark notifications read. Body: { ids?: string[] } (all if omitted).
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  let query = supabase.from('forum_notifications').update({ is_read: true }).eq('user_id', user.id);
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    query = query.in('id', body.ids.slice(0, 100));
  } else {
    query = query.eq('is_read', false);
  }
  await query;
  return NextResponse.json({ ok: true });
}
