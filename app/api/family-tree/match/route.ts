import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findArchiveMatches } from '@/lib/family-tree/archive-matching';
import type { TreeIndividual } from '@/lib/types';

export const maxDuration = 60;

// POST — find archive records that may refer to a tree individual.
// Body: { individual_id }.
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

  // Searching arbitrary collection tables needs the service-role client, the
  // same way /api/collection-search does.
  const admin = createAdminClient();
  const matches = await findArchiveMatches(admin, person as TreeIndividual);

  return NextResponse.json({ matches });
}
