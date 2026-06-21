import type { SupabaseClient } from '@supabase/supabase-js';

// Notification fan-out helpers. All writes use the service-role (admin) client
// because RLS only lets a user touch their OWN notification rows — creating a
// notification FOR someone else must bypass that.

type NotifType = 'reply' | 'reaction' | 'mention' | 'vote' | 'follow';

// Extract @handles from post text (3–20 chars, letters/digits/underscore).
export function parseMentions(content: string): string[] {
  const handles = new Set<string>();
  const re = /(?:^|[^a-z0-9_])@([a-z0-9_]{3,20})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) handles.add(m[1].toLowerCase());
  return [...handles];
}

export async function resolveHandles(
  admin: SupabaseClient,
  handles: string[],
): Promise<string[]> {
  if (handles.length === 0) return [];
  const { data } = await admin.from('profiles').select('id').in('handle', handles);
  return (data ?? []).map((p) => p.id as string);
}

export async function getFollowerIds(
  admin: SupabaseClient,
  targetType: 'thread' | 'user' | 'surname',
  targetId: string,
): Promise<string[]> {
  const { data } = await admin
    .from('forum_follows')
    .select('user_id')
    .eq('target_type', targetType)
    .eq('target_id', targetId);
  return (data ?? []).map((f) => f.user_id as string);
}

interface CreateOpts {
  recipients: string[];
  actorId: string;
  type: NotifType;
  threadId?: string | null;
  postId?: string | null;
}

export async function createNotifications(
  admin: SupabaseClient,
  { recipients, actorId, type, threadId = null, postId = null }: CreateOpts,
): Promise<void> {
  const rows = [...new Set(recipients)]
    .filter((r) => r && r !== actorId) // never notify yourself
    .map((user_id) => ({
      user_id,
      actor_id: actorId,
      type,
      thread_id: threadId,
      post_id: postId,
    }));
  if (rows.length === 0) return;
  // Missing table (pre-migration) → swallow rather than fail the action.
  await admin.from('forum_notifications').insert(rows);
}
