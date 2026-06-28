import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchAndPersist } from '@/lib/family-tree/persist-matches';
import type { TreeIndividual } from '@/lib/types';

export const maxDuration = 60;

// POST — (re)scan the archive for one tree individual and persist the matches.
// Body: { individual_id }. Returns the person's persisted, non-dismissed matches.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const individualId = body.individual_id;
  if (typeof individualId !== 'string') {
    return NextResponse.json({ error: 'individual_id is required' }, { status: 400 });
  }

  // Ownership check runs through RLS on the user's session client.
  const { data: person } = await supabase
    .from('tree_individuals')
    .select('*')
    .eq('id', individualId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Searching arbitrary collection tables + writing match rows needs the
  // service-role client, the same way /api/collection-search does.
  const admin = createAdminClient();
  await matchAndPersist(admin, person as TreeIndividual);

  // Return the persisted matches (with their row ids) for the UI.
  const { data: matches } = await supabase
    .from('tree_individual_matches')
    .select('*')
    .eq('individual_id', individualId)
    .neq('status', 'dismissed')
    .order('score', { ascending: false });

  return NextResponse.json({ matches: matches ?? [] });
}
