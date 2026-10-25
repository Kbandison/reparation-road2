import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AiError, MIGRATION_NEEDED, isMissingSchema } from '@/lib/ai/client';
import { MODEL_LABELS, TRANSCRIPTION_MODELS, SONNET, type TranscriptionModel } from '@/lib/ai/models';
import { listCollectionScans } from '@/lib/transcription/scans';
import {
  batchCostPerScan,
  cancelJob,
  refreshJob,
  remainingBudget,
  runTrial,
  startBatch,
  type TranscriptionJob,
} from '@/lib/transcription/runs';
import type { Collection } from '@/lib/types';

// A pilot transcription takes up to a minute; collecting a finished batch of
// thousands of pages takes longer.
export const maxDuration = 300;

const isModel = (value: unknown): value is TranscriptionModel =>
  typeof value === 'string' && (TRANSCRIPTION_MODELS as readonly string[]).includes(value);

/** Below this, a pilot call is refused so the month's budget is never overrun. */
const PILOT_MIN_BUDGET = 0.5;

function fail(err: unknown, context: string) {
  if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof Error && isMissingSchema(err.message)) return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 });
  console.error(`[transcription] ${context}`, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Something went wrong' }, { status: 500 });
}

type CollectionRow = Pick<Collection, 'slug' | 'name' | 'table_name' | 'discriminator_column' | 'discriminator_value' | 'parent_slug'>;

async function findCollection(admin: ReturnType<typeof createAdminClient>, slug: string): Promise<CollectionRow | null> {
  const { data } = await admin
    .from('collections')
    .select('slug, name, table_name, discriminator_column, discriminator_value, parent_slug')
    .eq('slug', slug)
    .maybeSingle();
  return (data as CollectionRow | null) ?? null;
}

/** A job as the admin page sees it: without the (possibly thousands of) scan keys. */
function publicJob(job: TranscriptionJob): Omit<TranscriptionJob, 'image_keys'> {
  const rest: Partial<TranscriptionJob> = { ...job };
  delete rest.image_keys;
  return rest as Omit<TranscriptionJob, 'image_keys'>;
}

async function transcriptionModel(admin: ReturnType<typeof createAdminClient>): Promise<TranscriptionModel> {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'transcription_model').maybeSingle();
  return isModel(data?.value) ? data.value : SONNET;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    if (action === 'overview') {
      const [{ data: collections }, { data: transcripts }, { data: jobs }, model, budget] = await Promise.all([
        admin.from('collections').select('slug, name, parent_slug, table_name').not('table_name', 'is', null).order('name'),
        admin.from('scan_transcriptions').select('collection_slug'),
        admin.from('transcription_jobs').select('*').order('created_at', { ascending: false }).limit(25),
        transcriptionModel(admin),
        remainingBudget(admin),
      ]);

      // Bring running jobs up to date (and collect any that finished).
      const refreshed: TranscriptionJob[] = [];
      for (const job of (jobs ?? []) as TranscriptionJob[]) {
        try {
          refreshed.push(await refreshJob(admin, job));
        } catch (err) {
          console.error('[transcription] refresh failed', job.id, err);
          refreshed.push(job);
        }
      }

      const transcribedBySlug = new Map<string, number>();
      for (const t of transcripts ?? []) {
        const slug = t.collection_slug as string | null;
        if (slug) transcribedBySlug.set(slug, (transcribedBySlug.get(slug) ?? 0) + 1);
      }
      const names = new Map((collections ?? []).map((c) => [c.slug as string, c.name as string]));

      const perScan = Object.fromEntries(
        await Promise.all(TRANSCRIPTION_MODELS.map(async (m) => [m, await batchCostPerScan(admin, m)] as const)),
      );

      return NextResponse.json({
        collections: (collections ?? []).map((c) => ({
          slug: c.slug,
          name: c.name,
          parentName: c.parent_slug ? names.get(c.parent_slug as string) ?? null : null,
          transcribed: transcribedBySlug.get(c.slug as string) ?? 0,
        })),
        jobs: refreshed.map(publicJob),
        model,
        models: TRANSCRIPTION_MODELS.map((m) => ({ id: m, label: MODEL_LABELS[m] })),
        perScan,
        budget,
      });
    }

    if (action === 'scans') {
      const collection = await findCollection(admin, searchParams.get('collection') ?? '');
      if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      const { scans, recordsWithoutScan } = await listCollectionScans(admin, collection);
      const open = scans.filter((s) => !s.transcribed);
      return NextResponse.json({
        total: scans.length,
        transcribed: scans.length - open.length,
        withOcr: scans.filter((s) => s.hasOcr).length,
        toDo: open.filter((s) => !s.hasOcr).length,
        toDoWithOcr: open.length,
        recordsWithoutScan,
      });
    }

    if (action === 'trials') {
      let runId = searchParams.get('run');
      if (!runId) {
        const { data: latest } = await admin
          .from('transcription_trials')
          .select('run_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        runId = (latest?.run_id as string | undefined) ?? null;
      }
      if (!runId) return NextResponse.json({ runId: null, trials: [] });
      const { data, error } = await admin
        .from('transcription_trials')
        .select('id, image_key, collection_slug, model, text, confidence, notes, error, input_tokens, output_tokens, cost_usd, duration_ms, created_at')
        .eq('run_id', runId)
        .order('created_at');
      if (error) throw new Error(error.message);
      return NextResponse.json({ runId, trials: data ?? [] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return fail(err, `GET ${action}`);
  }
}

export async function POST(request: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body' }, { status: 400 });
  }

  try {
    // Pick pages for a pilot: a few untranscribed scans from each chosen collection.
    if (body.action === 'pilot-sample') {
      const slugs = Array.isArray(body.collections) ? body.collections.map(String).slice(0, 8) : [];
      const perCollection = Math.min(Math.max(Number(body.perCollection) || 4, 1), 10);
      if (slugs.length === 0) return NextResponse.json({ error: 'Pick at least one collection' }, { status: 400 });

      const items: { imageKey: string; collectionSlug: string }[] = [];
      for (const slug of slugs) {
        const collection = await findCollection(admin, slug);
        if (!collection) continue;
        const { scans } = await listCollectionScans(admin, collection);
        const open = scans.filter((s) => !s.transcribed);
        // A random spread, not just the first pages of the book.
        for (let i = open.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [open[i], open[j]] = [open[j], open[i]];
        }
        for (const scan of open.slice(0, perCollection)) items.push({ imageKey: scan.key, collectionSlug: slug });
      }
      if (items.length === 0) return NextResponse.json({ error: 'Those collections have no untranscribed scans' }, { status: 400 });
      return NextResponse.json({ runId: randomUUID(), items });
    }

    // Transcribe one pilot page with one model.
    if (body.action === 'pilot-one') {
      const runId = String(body.runId ?? '');
      const imageKey = String(body.imageKey ?? '');
      const collectionSlug = String(body.collectionSlug ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(runId) || !imageKey || !collectionSlug || !isModel(body.model)) {
        return NextResponse.json({ error: 'runId, imageKey, collectionSlug and a pilot model are required' }, { status: 400 });
      }
      const budget = await remainingBudget(admin);
      if (budget.remaining < PILOT_MIN_BUDGET) {
        return NextResponse.json({ error: "This month's AI budget is used up." }, { status: 402 });
      }
      const trial = await runTrial(admin, { runId, imageKey, collectionSlug, model: body.model, userId });
      return NextResponse.json(trial);
    }

    if (body.action === 'set-model') {
      if (!isModel(body.model)) return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
      const { error } = await admin
        .from('app_settings')
        .upsert({ key: 'transcription_model', value: body.model, updated_by: userId, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return NextResponse.json({ model: body.model });
    }

    if (body.action === 'start') {
      const collection = await findCollection(admin, String(body.collection ?? ''));
      if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      const model = isModel(body.model) ? body.model : await transcriptionModel(admin);
      const job = await startBatch(admin, { collection, model, includeOcr: body.includeOcr === true, userId });
      return NextResponse.json({ job: publicJob(job) });
    }

    if (body.action === 'cancel') {
      const { data: job } = await admin.from('transcription_jobs').select('*').eq('id', String(body.jobId ?? '')).maybeSingle();
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      await cancelJob(admin, job as TranscriptionJob);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return fail(err, `POST ${String(body.action)}`);
  }
}
