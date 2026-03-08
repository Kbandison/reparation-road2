import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin';
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = 25;
  const search = searchParams.get('search') || '';

  const supabase = createAdminClient();

  let query = supabase
    .from('bookings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ bookings: data || [], count: count || 0, page, pageSize });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const supabase = createAdminClient();

  const { error } = await supabase.from('bookings').insert({
    name: body.name,
    email: body.email,
    message: body.message || null,
    session_type: body.session_type,
    date: body.date,
    time: body.time,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'Booking id is required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('bookings').update(updates).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Booking id is required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('bookings').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
