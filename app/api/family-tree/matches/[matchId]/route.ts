import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TreeArchiveMatch } from '@/lib/types';
import { syncArchivePointer } from '@/lib/family-tree/saved-records';

const STATUSES = new Set(['suggested', 'linked', 'dismissed']);

// PATCH — change a match's status. Body: { status }.
//  - 'linked'    saves the record to the person (alongside any others).
//  - 'dismissed' hides the suggestion.
//  - 'suggested' turns a saved record back into a suggestion.
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

  const { data: updated, error } = await supabase
    .from('tree_individual_matches')
    .update({ status })
    .eq('id', m.id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A person can have any number of saved ('linked') records; their archive_*
  // fields just mirror the first one for the tree's link badge.
  await syncArchivePointer(supabase, m.individual_id, user.id);

  return NextResponse.json({ match: updated });
}
