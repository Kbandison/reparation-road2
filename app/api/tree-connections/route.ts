import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOverlapsByResearcher } from '@/lib/tree-connections';

/** Researchers whose trees overlap with the signed-in user's. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('profiles')
    .select('tree_sharing_enabled, tree_sharing_include_living')
    .eq('id', user.id)
    .maybeSingle();

  if (!settings?.tree_sharing_enabled) {
    // Not an error — the expected state until someone opts in.
    return NextResponse.json({ sharing: false, includeLiving: false, overlaps: [] });
  }

  return NextResponse.json({
    sharing: true,
    includeLiving: Boolean(settings.tree_sharing_include_living),
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
  const updates: Record<string, unknown> = {};

  if (typeof body.enabled === 'boolean') {
    updates.tree_sharing_enabled = body.enabled;
    // Records when consent was given, and is left in place when sharing is
    // switched off so the history stays readable.
    if (body.enabled) updates.tree_sharing_enabled_at = new Date().toISOString();
  }
  if (typeof body.includeLiving === 'boolean') {
    updates.tree_sharing_include_living = body.includeLiving;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update(updates).eq('id', user.id);

  if (error) {
    console.error('[tree-connections] could not update sharing:', error);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...updates });
}
