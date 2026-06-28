import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  'archive_collection_slug',
  'archive_record_id',
  'archive_record_title',
] as const;

// PATCH — edit a person's fields, position, or archive link. Passing all three
// archive_* fields as null unlinks them from the archive.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of FIELDS) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('tree_individuals')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ individual: data });
}

// DELETE — remove a person. Their relationship edges cascade away via FK.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('tree_individuals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
