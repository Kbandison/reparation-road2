import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — load a thread plus its messages, scoped to the calling user.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: thread } = await admin
    .from('assistant_threads')
    .select('id, user_id, title, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  // Not found OR not yours — same response either way, no info leak.
  if (!thread || thread.user_id !== user.id) {
    return NextResponse.json({ thread: null, messages: [] });
  }

  const { data: messages } = await admin
    .from('assistant_messages')
    .select('id, role, content, parts, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ thread, messages: messages ?? [] });
}

// DELETE — owner-only, cascades messages via FK.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: thread } = await admin
    .from('assistant_threads')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!thread || thread.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await admin
    .from('assistant_threads')
    .delete()
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
