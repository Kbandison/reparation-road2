import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getResearchersForIndividual,
  isSharingEnabled,
} from '@/lib/tree-connections';

/** Researchers who also hold this individual. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ individualId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { individualId } = await params;

  // The individual must belong to the caller — this endpoint reveals who else
  // holds a person, which is only theirs to see for their own tree.
  const admin = createAdminClient();
  const { data: individual } = await admin
    .from('tree_individuals')
    .select('user_id')
    .eq('id', individualId)
    .maybeSingle();

  if (!individual || individual.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!(await isSharingEnabled(user.id))) {
    return NextResponse.json({ sharing: false, researchers: [] });
  }

  return NextResponse.json({
    sharing: true,
    researchers: await getResearchersForIndividual(user.id, individualId),
  });
}
