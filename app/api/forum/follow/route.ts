import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotifications } from '@/lib/forum/notify';

const TARGETS = new Set(['thread', 'user', 'surname']);

// POST { target_type, target_id } — toggle a follow. Returns { following }.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetType = body.target_type;
  const targetId = typeof body.target_id === 'string' ? body.target_id.trim() : '';
  if (!TARGETS.has(targetType) || !targetId) {
    return NextResponse.json({ error: 'Invalid follow target' }, { status: 400 });
  }
  // Don't let a user follow themselves.
  if (targetType === 'user' && targetId === user.id) {
    return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('forum_follows')
    .select('id')
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle();

  if (existing) {
    await supabase.from('forum_follows').delete().eq('id', existing.id);
    return NextResponse.json({ following: false });
  }

  await supabase
    .from('forum_follows')
    .insert({ user_id: user.id, target_type: targetType, target_id: targetId });

  // Tell a user when someone follows them.
  if (targetType === 'user') {
    try {
      const admin = createAdminClient();
      await createNotifications(admin, {
        recipients: [targetId],
        actorId: user.id,
        type: 'follow',
      });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ following: true });
}
