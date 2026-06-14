import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST — connect two existing people. Body: { tree_id, type, from_id, to_id }.
// 'parent': from_id is the parent of to_id. 'spouse': partners (unordered).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { tree_id: treeId, type, from_id: fromId, to_id: toId } = body;

  if (
    typeof treeId !== 'string' ||
    (type !== 'parent' && type !== 'spouse') ||
    typeof fromId !== 'string' ||
    typeof toId !== 'string' ||
    fromId === toId
  ) {
    return NextResponse.json({ error: 'Invalid relationship' }, { status: 400 });
  }

  const { data: tree } = await supabase
    .from('family_trees')
    .select('id')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Both endpoints must belong to this tree.
  const { data: people } = await supabase
    .from('tree_individuals')
    .select('id')
    .eq('tree_id', treeId)
    .in('id', [fromId, toId]);
  if (!people || people.length !== 2) {
    return NextResponse.json({ error: 'Both people must be in this tree' }, { status: 400 });
  }

  // Skip if an equivalent edge already exists (spouse is unordered).
  const { data: existing } = await supabase
    .from('tree_relationships')
    .select('id, type, from_id, to_id')
    .eq('tree_id', treeId)
    .eq('type', type);
  const dup = (existing ?? []).find((e) =>
    type === 'spouse'
      ? (e.from_id === fromId && e.to_id === toId) ||
        (e.from_id === toId && e.to_id === fromId)
      : e.from_id === fromId && e.to_id === toId
  );
  if (dup) return NextResponse.json({ relationship: dup });

  const { data, error } = await supabase
    .from('tree_relationships')
    .insert({ tree_id: treeId, user_id: user.id, type, from_id: fromId, to_id: toId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ relationship: data }, { status: 201 });
}
