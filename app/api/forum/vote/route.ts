import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotifications } from '@/lib/forum/notify';

// POST — set the viewer's vote on a thread. Body: { thread_id, value: 1 | 0 }
// (0 clears the vote). Keeps forum_threads.vote_count in sync. Returns the new
// total and the viewer's vote. No-ops gracefully if the social migration
// hasn't been run yet.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const threadId = body.thread_id;
  const value = body.value === 1 ? 1 : 0; // upvote-only for now
  if (typeof threadId !== 'string') {
    return NextResponse.json({ error: 'thread_id is required' }, { status: 400 });
  }

  // Read the viewer's current vote.
  const { data: existing, error: readErr } = await supabase
    .from('forum_votes')
    .select('id, value')
    .eq('user_id', user.id)
    .eq('thread_id', threadId)
    .maybeSingle();

  // Missing table → feature not migrated yet; report a no-op rather than 500.
  if (readErr && readErr.code === '42P01') {
    return NextResponse.json({ voteCount: 0, myVote: 0, migrated: false });
  }

  const had = existing?.value === 1;
  const want = value === 1;

  if (had === want) {
    // No change.
    const { data: t } = await supabase
      .from('forum_threads')
      .select('vote_count')
      .eq('id', threadId)
      .maybeSingle();
    return NextResponse.json({ voteCount: t?.vote_count ?? 0, myVote: want ? 1 : 0 });
  }

  if (want) {
    await supabase
      .from('forum_votes')
      .upsert(
        { user_id: user.id, thread_id: threadId, value: 1 },
        { onConflict: 'user_id,thread_id' },
      );
  } else {
    await supabase.from('forum_votes').delete().eq('user_id', user.id).eq('thread_id', threadId);
  }

  // Recount with the service-role client (RLS lets users read all votes anyway,
  // but this keeps the count authoritative regardless of policy).
  const admin = createAdminClient();
  const { count } = await admin
    .from('forum_votes')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('value', 1);
  const voteCount = count ?? 0;

  await admin.from('forum_threads').update({ vote_count: voteCount }).eq('id', threadId);

  // Tell the author when their post is upvoted (best-effort).
  if (want) {
    try {
      const { data: thread } = await admin
        .from('forum_threads')
        .select('user_id')
        .eq('id', threadId)
        .maybeSingle();
      if (thread?.user_id) {
        await createNotifications(admin, {
          recipients: [thread.user_id],
          actorId: user.id,
          type: 'vote',
          threadId,
        });
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ voteCount, myVote: want ? 1 : 0 });
}
