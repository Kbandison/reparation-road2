import type { SupabaseClient } from '@supabase/supabase-js';
import { AiError, getAnthropic, toAiError } from '@/lib/ai/client';
import { getAiLimits } from '@/lib/ai/limits';
import { SCAN_TOKEN_ESTIMATE, addUsage, costOf, EMPTY_USAGE, type TokenUsage } from '@/lib/ai/models';
import { recordUsage, totalSpendThisMonth } from '@/lib/ai/usage';
import type { Collection } from '@/lib/types';
import { readTranscript, transcriptionRequest, type Transcript } from './prompt';
import { listCollectionScans, transcriptionImageUrl } from './scans';
import type { AiBudget, TranscriptionJob } from './types';

export type { TranscriptionJob } from './types';

// Server-only: calls Claude and writes transcripts with the service-role client.

/** Jobs still waiting on Anthropic hold their estimate against the budget until their real cost is logged. */
const OPEN_STATUSES = ['submitting', 'processing', 'ingesting'] as const;

// ---------------------------------------------------------------------------
// One scan, right now (the pilot)
// ---------------------------------------------------------------------------

export interface TrialResult {
  id: string;
  imageKey: string;
  model: string;
  transcript: Transcript | null;
  error: string | null;
  costUsd: number;
  durationMs: number;
}

/**
 * Transcribes one scan immediately and files it as a pilot trial. The pilot
 * runs the same scans through each model so an admin can compare them.
 */
export async function runTrial(
  admin: SupabaseClient,
  input: { runId: string; imageKey: string; collectionSlug: string; model: string; userId: string },
): Promise<TrialResult> {
  const started = Date.now();
  let usage: TokenUsage = EMPTY_USAGE;
  let transcript: Transcript | null = null;
  let error: string | null = null;

  try {
    // Streamed because the token limit is high enough that the SDK requires it;
    // only the finished message is used.
    const message = await getAnthropic().messages.stream(transcriptionRequest(input.model, transcriptionImageUrl(input.imageKey))).finalMessage();
    usage = message.usage;
    const read = readTranscript(message);
    if (read.ok) transcript = read.transcript;
    else error = read.error;
  } catch (err) {
    error = toAiError(err, 'transcription-pilot').message;
  }

  const durationMs = Date.now() - started;
  const costUsd = await recordUsage(admin, {
    feature: 'transcription_pilot',
    model: input.model,
    usage,
    userId: input.userId,
    meta: { run_id: input.runId, image_key: input.imageKey },
  });

  const { data, error: saveError } = await admin
    .from('transcription_trials')
    .insert({
      run_id: input.runId,
      image_key: input.imageKey,
      collection_slug: input.collectionSlug,
      model: input.model,
      text: transcript?.text ?? null,
      confidence: transcript?.confidence ?? null,
      notes: transcript?.notes ?? null,
      error,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
    })
    .select('id')
    .single();
  if (saveError) throw new Error(`Couldn't save the pilot result: ${saveError.message}`);

  return { id: data.id as string, imageKey: input.imageKey, model: input.model, transcript, error, costUsd, durationMs };
}

// ---------------------------------------------------------------------------
// Estimates and the budget
// ---------------------------------------------------------------------------

/**
 * What one scan costs in a batch: the pilot's measured average for this model
 * once there are enough pilot runs, otherwise a planning figure.
 */
export async function batchCostPerScan(admin: SupabaseClient, model: string): Promise<{ usd: number; measured: boolean }> {
  const { data } = await admin
    .from('transcription_trials')
    .select('cost_usd')
    .eq('model', model)
    .is('error', null)
    .limit(500);
  const costs = (data ?? []).map((r) => Number(r.cost_usd)).filter((n) => n > 0);
  if (costs.length >= 5) {
    // Trials run at standard prices; a batch costs half.
    return { usd: (costs.reduce((a, b) => a + b, 0) / costs.length) * 0.5, measured: true };
  }
  return { usd: costOf(model, SCAN_TOKEN_ESTIMATE, { batch: true }), measured: false };
}

/** What's left of this month's AI budget, counting batches still in flight at their estimate. */
export async function remainingBudget(admin: SupabaseClient): Promise<AiBudget> {
  const [limits, spent, open] = await Promise.all([
    getAiLimits(admin),
    totalSpendThisMonth(admin),
    admin.from('transcription_jobs').select('estimated_cost').in('status', [...OPEN_STATUSES]),
  ]);
  const committed = (open.data ?? []).reduce((sum, j) => sum + Number(j.estimated_cost ?? 0), 0);
  const budget = limits.monthly_budget_usd;
  return { budget, spent, committed, remaining: Math.max(0, budget - spent - committed) };
}

// ---------------------------------------------------------------------------
// A whole collection, in a batch
// ---------------------------------------------------------------------------

type JobCollection = Pick<Collection, 'slug' | 'table_name' | 'discriminator_column' | 'discriminator_value'>;

/** The scans a batch would transcribe: untranscribed pages, minus those already OCR'd unless asked to redo them. */
export async function scansToTranscribe(admin: SupabaseClient, collection: JobCollection, includeOcr: boolean): Promise<string[]> {
  const { scans } = await listCollectionScans(admin, collection);
  return scans.filter((s) => !s.transcribed && (includeOcr || !s.hasOcr)).map((s) => s.key);
}

/**
 * Sends a collection's untranscribed scans to the Batch API (half price,
 * usually done within the hour). Refuses a run that would take the month past
 * its budget, and says how many scans would fit.
 */
export async function startBatch(
  admin: SupabaseClient,
  input: { collection: JobCollection; model: string; includeOcr: boolean; userId: string },
): Promise<TranscriptionJob> {
  const { collection, model } = input;
  if (!collection.table_name) throw new AiError('This collection has no records to transcribe.', 400);

  const keys = await scansToTranscribe(admin, collection, input.includeOcr);
  if (keys.length === 0) throw new AiError('Every scan in this collection is already transcribed.', 400);

  const [{ usd: perScan }, budget] = await Promise.all([batchCostPerScan(admin, model), remainingBudget(admin)]);
  const estimate = perScan * keys.length;
  if (estimate > budget.remaining) {
    const fits = Math.floor(budget.remaining / perScan);
    throw new AiError(
      `Transcribing ${keys.length.toLocaleString()} scans would cost about $${estimate.toFixed(2)}, and $${budget.remaining.toFixed(2)} of this month's AI budget is left` +
        (fits > 0 ? ` (enough for about ${fits.toLocaleString()} scans).` : '.'),
      402,
    );
  }

  const { data: job, error } = await admin
    .from('transcription_jobs')
    .insert({
      created_by: input.userId,
      collection_slug: collection.slug,
      table_name: collection.table_name,
      model,
      include_ocr: input.includeOcr,
      image_keys: keys,
      scan_count: keys.length,
      estimated_cost: Number(estimate.toFixed(4)),
    })
    .select('*')
    .single();
  if (error) throw new Error(`Couldn't create the transcription job: ${error.message}`);

  try {
    const batch = await getAnthropic().messages.batches.create({
      // custom_id must be short and plain, so it's the scan's index in image_keys.
      requests: keys.map((key, i) => ({ custom_id: `s${i}`, params: transcriptionRequest(model, transcriptionImageUrl(key)) })),
    });
    const { data: submitted } = await admin
      .from('transcription_jobs')
      .update({ batch_id: batch.id, status: 'processing' })
      .eq('id', job.id)
      .select('*')
      .single();
    return submitted as TranscriptionJob;
  } catch (err) {
    const message = toAiError(err, 'transcription-batch').message;
    await admin.from('transcription_jobs').update({ status: 'failed', error: message }).eq('id', job.id);
    throw new AiError(`Couldn't start the batch: ${message}`, 502);
  }
}

/** A job that died while collecting results can be collected again after this long. */
const STALE_INGEST_MS = 10 * 60_000;

/**
 * Checks a running job with Anthropic and, once its batch has ended, files the
 * transcripts and logs the real cost. Safe to call repeatedly and from two
 * places at once: only one caller wins the switch to "ingesting", transcripts
 * never overwrite existing ones, and the cost is logged under the job's id.
 */
export async function refreshJob(admin: SupabaseClient, job: TranscriptionJob): Promise<TranscriptionJob> {
  const staleIngest = job.status === 'ingesting' && Date.now() - new Date(job.ended_at ?? job.created_at).getTime() > STALE_INGEST_MS;
  if ((job.status !== 'processing' && !staleIngest) || !job.batch_id) return job;

  const client = getAnthropic();
  if (job.status === 'processing') {
    const batch = await client.messages.batches.retrieve(job.batch_id);
    if (batch.processing_status !== 'ended') return job;
  }

  // Claim the ingest. Whoever doesn't win leaves it to the one who did.
  const { data: claimed } = await admin
    .from('transcription_jobs')
    .update({ status: 'ingesting', ended_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', job.status)
    .select('*')
    .maybeSingle();
  if (!claimed) return job;

  let usage: TokenUsage = EMPTY_USAGE;
  let succeeded = 0;
  let failed = 0;
  const errors = new Set<string>();
  let pending: Record<string, unknown>[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const { error } = await admin.from('scan_transcriptions').upsert(pending, { onConflict: 'image_key', ignoreDuplicates: true });
    if (error) throw new Error(`Couldn't save transcripts: ${error.message}`);
    pending = [];
  };

  try {
    for await (const item of await client.messages.batches.results(job.batch_id)) {
      const key = job.image_keys[Number(item.custom_id.slice(1))];
      if (!key) continue;
      if (item.result.type !== 'succeeded') {
        failed++;
        errors.add(item.result.type === 'errored' ? item.result.error.error.message : `Request ${item.result.type}`);
        continue;
      }
      const message = item.result.message;
      usage = addUsage(usage, message.usage);
      const read = readTranscript(message);
      if (!read.ok) {
        failed++;
        errors.add(read.error);
        continue;
      }
      succeeded++;
      pending.push({
        image_key: key,
        table_name: job.table_name,
        collection_slug: job.collection_slug,
        text: read.transcript.text,
        ai_text: read.transcript.text,
        confidence: read.transcript.confidence,
        notes: read.transcript.notes || null,
        model: job.model,
        job_id: job.id,
      });
      if (pending.length >= 100) await flush();
    }
    await flush();
  } catch (err) {
    // Leave it "ingesting": it can be collected again once stale.
    await admin.from('transcription_jobs').update({ error: err instanceof Error ? err.message : 'Collecting results failed' }).eq('id', job.id);
    throw err;
  }

  const actual = await recordUsage(admin, {
    id: job.id,
    feature: 'transcription',
    model: job.model,
    usage,
    batch: true,
    userId: job.created_by,
    meta: { job_id: job.id, collection_slug: job.collection_slug, scans: job.scan_count, succeeded, failed },
  });

  const { data: done } = await admin
    .from('transcription_jobs')
    .update({
      status: 'done',
      succeeded,
      failed,
      actual_cost: Number(actual.toFixed(4)),
      ingested_at: new Date().toISOString(),
      error: errors.size ? [...errors].slice(0, 3).join(' · ') : null,
    })
    .eq('id', job.id)
    .select('*')
    .single();
  return done as TranscriptionJob;
}

/** Stops a running batch. Requests already finished are still collected and billed. */
export async function cancelJob(admin: SupabaseClient, job: TranscriptionJob): Promise<void> {
  if (job.status !== 'processing' || !job.batch_id) throw new AiError('Only a running job can be canceled.', 400);
  try {
    await getAnthropic().messages.batches.cancel(job.batch_id);
  } catch (err) {
    throw toAiError(err, 'transcription-cancel');
  }
  // The batch ends shortly; the next refresh collects what finished.
}
