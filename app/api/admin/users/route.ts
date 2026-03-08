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

// GET - list users with pagination and search
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = 25;
  const search = searchParams.get('search') || '';

  const supabase = createAdminClient();

  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  const { data: profiles, count, error } = await query
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profiles: profiles || [], count: count || 0, page, pageSize });
}

// POST - create a new user
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { email, password, first_name, last_name, role, subscription_status } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Create auth user with admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Update the profile (trigger should have created it)
  if (authData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || 'user',
        subscription_status: subscription_status || 'free',
      })
      .eq('id', authData.user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, userId: authData.user?.id });
}

// PATCH - update a user
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, first_name, last_name, role, subscription_status, email } = body;

  if (!id) {
    return NextResponse.json({ error: 'User id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Update profile
  const updates: Record<string, unknown> = {};
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (role !== undefined) updates.role = role;
  if (subscription_status !== undefined) updates.subscription_status = subscription_status;
  if (email !== undefined) updates.email = email;

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  // If email changed, also update auth user
  if (email) {
    await supabase.auth.admin.updateUserById(id, { email });
  }

  return NextResponse.json({ success: true });
}

// DELETE - delete a user
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'User id is required' }, { status: 400 });
  }

  // Prevent self-deletion
  if (id === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Delete auth user (cascade should handle profile)
  const { error } = await supabase.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
