import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface PositionUpdate {
  id: string;
  x: number;
  y: number;
}

// PATCH — persist dragged card positions. Body: { positions: [{id,x,y}] }.
// The canvas sends only the cards that actually moved.
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

  const { data: tree } = await supabase
    .from('family_trees')
    .select('id')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const positions: PositionUpdate[] = Array.isArray(body.positions)
    ? body.positions
        .filter(
          (p: unknown): p is PositionUpdate =>
            !!p &&
            typeof (p as PositionUpdate).id === 'string' &&
            Number.isFinite((p as PositionUpdate).x) &&
            Number.isFinite((p as PositionUpdate).y)
        )
        .slice(0, 1000)
    : [];

  if (positions.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  await Promise.all(
    positions.map((p) =>
      supabase
        .from('tree_individuals')
        .update({ pos_x: p.x, pos_y: p.y })
        .eq('id', p.id)
        .eq('tree_id', treeId)
        .eq('user_id', user.id)
    )
  );

  // Touch the tree so the dashboard ordering reflects recent edits.
  await supabase
    .from('family_trees')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', treeId)
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true, updated: positions.length });
}
