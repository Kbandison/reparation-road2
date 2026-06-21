import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  parseMentions,
  resolveHandles,
  getFollowerIds,
  createNotifications,
} from '@/lib/forum/notify';

// POST { thread_id, content } — create a reply and fan out notifications to the
// thread author, the thread's followers, and any @mentioned users.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const threadId = body.thread_id;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (typeof threadId !== 'string' || !content) {
    return NextResponse.json({ error: 'thread_id and content are required' }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from('forum_posts')
    .insert({ thread_id: threadId, user_id: user.id, content })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fan-out (best-effort; never blocks the reply on a notification failure).
  try {
    const admin = createAdminClient();
    const { data: thread } = await admin
      .from('forum_threads')
      .select('user_id')
      .eq('id', threadId)
      .maybeSingle();

    const [followers, mentioned] = await Promise.all([
      getFollowerIds(admin, 'thread', threadId),
      resolveHandles(admin, parseMentions(content)),
    ]);

    const replyRecipients = [...(thread?.user_id ? [thread.user_id] : []), ...followers];
    await createNotifications(admin, {
      recipients: replyRecipients,
      actorId: user.id,
      type: 'reply',
      threadId,
      postId: post.id,
    });
    await createNotifications(admin, {
      recipients: mentioned,
      actorId: user.id,
      type: 'mention',
      threadId,
      postId: post.id,
    });
  } catch {
    // ignore notification errors
  }

  return NextResponse.json({ post });
}
