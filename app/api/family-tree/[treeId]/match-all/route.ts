import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchBatch } from '@/lib/family-tree/persist-matches';
import type { TreeIndividual } from '@/lib/types';

export const maxDuration = 60;

const MAX_LIMIT = 25;

// POST — match a batch of not-yet-searched individuals in this tree against the
// archive and persist the results. Body: { limit }. Returns { processed,
// remaining } so the client can loop until everyone is matched.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> },
) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ownership.
  const { data: tree } = await supabase
    .from('family_trees')
    .select('id')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 12));

  // The next batch of people who haven't been searched yet.
  const { data: pending, error } = await supabase
    .from('tree_individuals')
    .select('*')
    .eq('tree_id', treeId)
    .eq('user_id', user.id)
    .is('matched_at', null)
    .order('created_at')
    .limit(limit);

  if (error) {
    // matched_at column not migrated yet.
    return NextResponse.json({ error: 'Archive matching is not set up yet.', processed: 0, remaining: 0 }, { status: 200 });
  }

  const people = (pending ?? []) as TreeIndividual[];
  if (people.length > 0) {
    const admin = createAdminClient();
    await matchBatch(admin, people);
  }

  // How many remain unmatched after this batch.
  const { count } = await supabase
    .from('tree_individuals')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId)
    .eq('user_id', user.id)
    .is('matched_at', null);

  return NextResponse.json({ processed: people.length, remaining: count ?? 0 });
}
