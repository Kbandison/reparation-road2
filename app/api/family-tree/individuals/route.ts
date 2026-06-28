import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Vertical / horizontal offset when auto-placing a relative next to its anchor.
const ROW_OFFSET = 168;
const COL_OFFSET = 224;

const FIELDS = [
  'given_name',
  'surname',
  'sex',
  'birth_date',
  'birth_place',
  'death_date',
  'death_place',
  'is_living',
  'occupation',
  'notes',
  'pos_x',
  'pos_y',
] as const;

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

// POST — add a person to a tree. Optionally pass `relation` to also create an
// edge to an existing person and auto-position the new card next to them:
//   relation: { kind: 'parent' | 'child' | 'spouse', anchor_id }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const treeId = body.tree_id;
  if (typeof treeId !== 'string') {
    return NextResponse.json({ error: 'tree_id is required' }, { status: 400 });
  }

  const { data: tree } = await supabase
    .from('family_trees')
    .select('id')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fields = pickFields(body);

  // If a relation was requested, validate the anchor and seed a position.
  const relation = body.relation;
  let anchor: { id: string; pos_x: number; pos_y: number } | null = null;
  if (relation && typeof relation.anchor_id === 'string') {
    const { data } = await supabase
      .from('tree_individuals')
      .select('id, pos_x, pos_y')
      .eq('id', relation.anchor_id)
      .eq('tree_id', treeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: 'Anchor person not found' }, { status: 404 });
    }
    anchor = data as { id: string; pos_x: number; pos_y: number };

    if (fields.pos_x === undefined || fields.pos_y === undefined) {
      if (relation.kind === 'parent') {
        fields.pos_x = anchor.pos_x;
        fields.pos_y = anchor.pos_y - ROW_OFFSET;
      } else if (relation.kind === 'child') {
        fields.pos_x = anchor.pos_x;
        fields.pos_y = anchor.pos_y + ROW_OFFSET;
      } else {
        fields.pos_x = anchor.pos_x + COL_OFFSET;
        fields.pos_y = anchor.pos_y;
      }
    }
  }

  const { data: individual, error } = await supabase
    .from('tree_individuals')
    .insert({ ...fields, tree_id: treeId, user_id: user.id })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let relationship = null;
  if (anchor && relation) {
    // parent: anchor is the parent of the new child;
    // child: new person is the child of the anchor;
    // spouse: undirected partnership.
    const edge =
      relation.kind === 'parent'
        ? { type: 'parent', from_id: individual.id, to_id: anchor.id }
        : relation.kind === 'child'
          ? { type: 'parent', from_id: anchor.id, to_id: individual.id }
          : { type: 'spouse', from_id: anchor.id, to_id: individual.id };

    const { data: rel } = await supabase
      .from('tree_relationships')
      .insert({ ...edge, tree_id: treeId, user_id: user.id })
      .select('*')
      .single();
    relationship = rel;
  }

  return NextResponse.json({ individual, relationship }, { status: 201 });
}
