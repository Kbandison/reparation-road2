import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_TYPES = new Set(['collection', 'subcollection', 'record', 'search']);

// POST — mirror a client-side activity event into the user_activity table so
// the assistant has server-readable signal for personalized suggestions.
// The unique constraint on (user_id, type, target_slug) collapses repeats —
// each unique target keeps a single row whose occurred_at is bumped.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Anonymous visitors aren't tracked — quietly noop rather than error.
    return NextResponse.json({ success: false, anonymous: true });
  }

  let body: {
    type?: string;
    target_slug?: string;
    target_name?: string | null;
    collection_slug?: string | null;
    parent_slug?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.type || !body.target_slug) {
    return NextResponse.json(
      { error: 'type and target_slug are required' },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(body.type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }

  const { error } = await supabase.from('user_activity').upsert(
    {
      user_id: user.id,
      type: body.type,
      target_slug: body.target_slug,
      target_name: body.target_name ?? null,
      collection_slug: body.collection_slug ?? null,
      parent_slug: body.parent_slug ?? null,
      occurred_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,type,target_slug' },
  );
  if (error) {
    // user_activity table may not exist yet (SQL not run) — don't break tracking.
    if (error.code === '42P01') {
      return NextResponse.json({ success: false, missingTable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
