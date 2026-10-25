import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCollectionAccess } from '@/lib/collections/access';
import { requireAdmin } from '@/lib/admin-auth';
import { isMissingSchema } from '@/lib/ai/client';
import { transcribableKey } from '@/lib/transcription/scans';
import type { Collection } from '@/lib/types';

const MAX_TEXT = 200_000;

async function findCollection(slug: string): Promise<Collection | null> {
  const { data } = await createAdminClient().from('collections').select('*').eq('slug', slug).maybeSingle();
  return (data as Collection | null) ?? null;
}

// GET — the transcript of the page a record's scan shows, for anyone who can
// open that collection. Transcripts live behind the service key (see
// ai_features_migration.sql), so the paywall is checked here.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collection = await findCollection(searchParams.get('collection') ?? '');
  const key = transcribableKey(searchParams.get('image'));
  if (!collection || !key) return NextResponse.json({ transcript: null });

  const supabase = await createClient();
  const access = await checkCollectionAccess(supabase, collection);
  if (!access.hasAccess) return NextResponse.json({ error: 'Members only', reason: access.reason }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from('scan_transcriptions')
    .select('text, confidence, notes, model, edited_at, updated_at')
    .eq('image_key', key)
    .maybeSingle();
  // Before the migration runs there's nothing to show, not an error.
  if (error && !isMissingSchema(error.message)) {
    console.error('[transcriptions] load failed', key, error.message);
    return NextResponse.json({ error: 'Could not load the transcription' }, { status: 500 });
  }

  return NextResponse.json({
    transcript: data
      ? {
          text: data.text as string,
          confidence: data.confidence as string | null,
          notes: data.notes as string | null,
          model: data.model as string | null,
          edited: Boolean(data.edited_at),
          updatedAt: data.updated_at as string,
        }
      : null,
    canEdit: (await requireAdmin()) !== null,
  });
}

// PATCH — an admin's correction. Claude's original stays in ai_text.
export async function PATCH(request: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { collection?: unknown; image?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body' }, { status: 400 });
  }
  const key = transcribableKey(body.image);
  if (!key || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'image and text are required' }, { status: 400 });
  }
  if (body.text.length > MAX_TEXT) return NextResponse.json({ error: 'That transcription is too long' }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from('scan_transcriptions')
    .update({ text: body.text.trim(), edited_by: userId, edited_at: now, updated_at: now })
    .eq('image_key', key)
    .select('image_key')
    .maybeSingle();
  if (error) {
    console.error('[transcriptions] save failed', key, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'This page has no transcription yet' }, { status: 404 });
  return NextResponse.json({ success: true, updatedAt: now });
}
