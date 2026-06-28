import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TreeArchiveMatch } from '@/lib/types';

const STATUSES = new Set(['suggested', 'linked', 'dismissed']);

// PATCH — change a match's status. Body: { status }.
//  - 'linked'    confirms the record onto the individual (sets archive_*).
//  - 'dismissed' hides the suggestion.
//  - 'suggested' restores it (and clears the individual's link if it pointed here).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const status = body.status;
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { data: match } = await supabase
    .from('tree_individual_matches')
    .select('*')
    .eq('id', matchId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const m = match as TreeArchiveMatch;

  if (status === 'linked') {
    // Only one linked record per person — demote any other linked rows.
    await supabase
      .from('tree_individual_matches')
      .update({ status: 'suggested' })
      .eq('individual_id', m.individual_id)
      .eq('status', 'linked')
      .neq('id', m.id);

    await supabase
      .from('tree_individuals')
      .update({
        archive_collection_slug: m.collection_slug,
        archive_record_id: m.record_id,
        archive_record_title: m.title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', m.individual_id)
      .eq('user_id', user.id);
  }

  if (status === 'suggested' && m.status === 'linked') {
    // Unlinking the currently-linked record.
    await supabase
      .from('tree_individuals')
      .update({
        archive_collection_slug: null,
        archive_record_id: null,
        archive_record_title: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', m.individual_id)
      .eq('user_id', user.id);
  }

  const { data: updated, error } = await supabase
    .from('tree_individual_matches')
    .update({ status })
    .eq('id', m.id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ match: updated });
}
