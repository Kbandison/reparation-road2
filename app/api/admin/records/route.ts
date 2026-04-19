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

  const { tableName, id, payload } = await request.json();
  if (!tableName || !id || !payload) {
    return NextResponse.json({ error: 'tableName, id, and payload are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from(tableName).update(payload).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
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
