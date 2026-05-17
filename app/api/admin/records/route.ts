import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

// POST - create a new record
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tableName, payload } = await request.json();
  if (!tableName || !payload) return NextResponse.json({ error: 'tableName and payload are required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from(tableName).insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, record: data });
}

// PATCH - update an existing record
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tableName, id, ids, all, payload, discriminatorColumn, discriminatorValue } =
    await request.json();
  if (!tableName || !payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'tableName and payload are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Single-record update.
  if (id) {
    const { error } = await supabase.from(tableName).update(payload).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, updated: 1 });
  }

  // Bulk update of an explicit set of ids — batched so the request URL stays
  // within PostgREST limits for large selections.
  if (Array.isArray(ids) && ids.length > 0) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await supabase.from(tableName).update(payload).in('id', chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, updated: ids.length });
  }

  // Bulk update of an entire collection. PostgREST refuses an unfiltered
  // UPDATE, so scope by the discriminator when present, else an always-true
  // filter (id is never null) to cover the whole table.
  if (all) {
    let query = supabase.from(tableName).update(payload);
    query = discriminatorColumn && discriminatorValue
      ? query.ilike(discriminatorColumn, discriminatorValue)
      : query.not('id', 'is', null);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, updated: 'all' });
  }

  return NextResponse.json({ error: 'id, ids, or all is required' }, { status: 400 });
}

// DELETE - delete a record
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { tableName, id } = await request.json();
  if (!tableName || !id) return NextResponse.json({ error: 'tableName and id are required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from(tableName).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
