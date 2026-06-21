import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function cleanList(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(
    v
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean),
  )].slice(0, max);
}

// PATCH — update the current user's forum identity.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body.handle === 'string') {
    const handle = body.handle.trim().toLowerCase();
    if (handle && !HANDLE_RE.test(handle)) {
      return NextResponse.json(
        { error: 'Handle must be 3–20 characters: lowercase letters, numbers, or underscores.' },
        { status: 400 },
      );
    }
    if (handle) {
      // Reject a handle already taken by someone else.
      const { data: taken } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', handle)
        .neq('id', user.id)
        .maybeSingle();
      if (taken) {
        return NextResponse.json({ error: 'That handle is already taken.' }, { status: 409 });
      }
      updates.handle = handle;
    }
  }

  if (typeof body.display_name === 'string') updates.display_name = body.display_name.trim().slice(0, 60) || null;
  if (typeof body.bio === 'string') updates.bio = body.bio.trim().slice(0, 400) || null;
  if (typeof body.avatar_url === 'string') updates.avatar_url = body.avatar_url.trim() || null;
  if ('research_surnames' in body) updates.research_surnames = cleanList(body.research_surnames);
  if ('research_regions' in body) updates.research_regions = cleanList(body.research_regions);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('handle, display_name, bio, avatar_url, research_surnames, research_regions')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profile: data });
}
