import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/family-tree/fetch-all';
import type { TreeIndividual } from '@/lib/types';

// GET — just enough of every person in one of the caller's trees to search and
// pick from (the "Save to family tree" picker), without the GEDCOM detail.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tree } = await supabase.from('family_trees').select('id').eq('id', treeId).eq('user_id', user.id).maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const people = await fetchAllRows<TreeIndividual>(
    supabase,
    'tree_individuals',
    { tree_id: treeId },
    { select: 'id, tree_id, given_name, surname, birth_date, death_date, birth_place' },
  );
  return NextResponse.json({ people });
}
