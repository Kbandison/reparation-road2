import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecordTitle } from '@/lib/collections/helpers';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return null;
  return user;
}

// GET - list relationships or search records within a collection
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const supabase = createAdminClient();

  // Sub-action: search records within a specific collection (for the record picker)
  if (action === 'search-records') {
    const collectionSlug = searchParams.get('collection');
    const q = searchParams.get('q')?.trim();

    if (!collectionSlug || !q || q.length < 2) {
      return NextResponse.json({ records: [] });
    }

    const { data: col } = await supabase
      .from('collections')
      .select('*')
      .eq('slug', collectionSlug)
      .single();

    if (!col || !col.table_name) {
      return NextResponse.json({ records: [] });
    }

    const searchCols = col.search_columns?.length ? col.search_columns : col.display_columns?.slice(0, 3) || [];
    if (searchCols.length === 0) return NextResponse.json({ records: [] });

    const orFilter = searchCols.map((c: string) => `${c}.ilike.%${q}%`).join(',');
    const selectCols = ['id', 'slug', ...new Set([...searchCols, ...(col.display_columns || []).slice(0, 3)])].join(',');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from(col.table_name)
      .select(selectCols)
      .or(orFilter)
      .limit(20);

    if (col.discriminator_column && col.discriminator_value) {
      query = query.ilike(col.discriminator_column, col.discriminator_value);
    }

    const { data: records } = await query;

    return NextResponse.json({
      records: (records || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        slug: r.slug || r.id,
        name: getRecordTitle(r, col),
      })),
    });
  }

  // Default: list all related_records
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = 25;
  const search = searchParams.get('search') || '';

  let query = supabase
    .from('related_records')
    .select('*', { count: 'exact' })
    .order('display_priority')
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(
      `source_name.ilike.%${search}%,target_name.ilike.%${search}%,relationship_type.ilike.%${search}%,source_collection.ilike.%${search}%,target_collection.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ records: data || [], count: count || 0, page, pageSize });
}

// POST - create a new relationship
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    source_record_id, source_collection_slug,
    target_record_id, target_collection_slug,
    relationship_type, relationship_note,
    display_priority, is_bidirectional, is_featured,
    source_name, target_name,
  } = body;

  if (!source_record_id || !source_collection_slug || !target_record_id || !target_collection_slug) {
    return NextResponse.json({ error: 'Source and target record/collection are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch collection metadata for source and target
  const [{ data: srcCol }, { data: tgtCol }] = await Promise.all([
    supabase.from('collections').select('name, table_name').eq('slug', source_collection_slug).single(),
    supabase.from('collections').select('name, table_name').eq('slug', target_collection_slug).single(),
  ]);

  const { data, error } = await supabase
    .from('related_records')
    .insert({
      source_record_id,
      source_table: srcCol?.table_name || '',
      source_name: source_name || null,
      source_collection: srcCol?.name || source_collection_slug,
      source_collection_slug,
      target_record_id,
      target_table: tgtCol?.table_name || '',
      target_name: target_name || null,
      target_collection: tgtCol?.name || target_collection_slug,
      target_collection_slug,
      relationship_type: relationship_type || null,
      relationship_note: relationship_note || null,
      display_priority: display_priority ?? 0,
      is_bidirectional: is_bidirectional ?? true,
      is_featured: is_featured ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, record: data });
}

// PATCH - update a relationship
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const allowedFields = [
    'relationship_type', 'relationship_note', 'display_priority',
    'is_bidirectional', 'is_featured', 'source_name', 'target_name',
  ];

  const filtered: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('related_records')
    .update(filtered)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

// DELETE - remove a relationship
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('related_records')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
