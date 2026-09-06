import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOverlapsByResearcher, isSharingEnabled } from '@/lib/tree-connections';

/** Researchers whose trees overlap with the signed-in user's. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sharing = await isSharingEnabled(user.id);
  if (!sharing) {
    // Not an error — the expected state until someone opts in.
    return NextResponse.json({ sharing: false, overlaps: [] });
  }

  return NextResponse.json({
    sharing: true,
    overlaps: await getOverlapsByResearcher(user.id),
  });
}

/** Turn tree sharing on or off. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Missing enabled flag' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      tree_sharing_enabled: body.enabled,
      // Records when consent was given, and is left in place when sharing is
      // switched off so the history stays readable.
      tree_sharing_enabled_at: body.enabled ? new Date().toISOString() : undefined,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[tree-connections] could not update sharing:', error);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  return NextResponse.json({ sharing: body.enabled });
}
