import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — the full graph for one tree (tree + individuals + relationships).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS already scopes to the owner; the explicit user_id filter makes a
  // not-yours tree return null rather than leaking its existence.
  const { data: tree } = await supabase
    .from('family_trees')
    .select('*')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: individuals }, { data: relationships }] = await Promise.all([
    supabase
      .from('tree_individuals')
      .select('*')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true }),
    supabase.from('tree_relationships').select('*').eq('tree_id', treeId),
  ]);

  return NextResponse.json({
    tree,
    individuals: individuals ?? [],
    relationships: relationships ?? [],
  });
}

// PATCH — rename / re-describe a tree.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.description === 'string') {
    updates.description = body.description.trim().slice(0, 500) || null;
  }
  if ('home_person_id' in body) {
    const hp = body.home_person_id;
    if (hp === null) {
      updates.home_person_id = null;
    } else if (typeof hp === 'string') {
      // Only accept a person who actually belongs to this tree.
      const { data: person } = await supabase
        .from('tree_individuals')
        .select('id')
        .eq('id', hp)
        .eq('tree_id', treeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (person) updates.home_person_id = hp;
    }
  }

  const { data, error } = await supabase
    .from('family_trees')
    .update(updates)
    .eq('id', treeId)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ tree: data });
}

// DELETE — remove a tree (individuals + relationships cascade).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('family_trees')
    .delete()
    .eq('id', treeId)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
