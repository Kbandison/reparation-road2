import type { SupabaseClient } from '@supabase/supabase-js';
import { costOf, type TokenUsage } from './models';

// Server-only: writes ai_usage with the service-role client.

export type AiFeature = 'assistant' | 'transcription' | 'transcription_pilot' | 'import_mapping' | 'descriptions';

/** The token columns of an ai_usage row, with the cost worked out. */
function usageColumns(model: string, usage: TokenUsage, batch: boolean) {
  return {
    model,
    batch,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
    cost_usd: costOf(model, usage, { batch }),
  };
}

/**
 * Logs one finished Claude call. Logging never fails the feature that made the
 * call: the work is done and paid for, so a lost row is reported, not thrown.
 */
export async function recordUsage(
  admin: SupabaseClient,
  entry: {
    feature: AiFeature;
    model: string;
    usage: TokenUsage;
    userId?: string | null;
    batch?: boolean;
    meta?: Record<string, unknown>;
    /**
     * A fixed row id makes logging idempotent: a batch job logs under its own
     * id, so collecting its results twice can't count its cost twice.
     */
    id?: string;
  },
): Promise<number> {
  const columns = usageColumns(entry.model, entry.usage, entry.batch ?? false);
  const { error } = await admin.from('ai_usage').insert({
    ...(entry.id && { id: entry.id }),
    feature: entry.feature,
    user_id: entry.userId ?? null,
    meta: entry.meta ?? null,
    ...columns,
  });
  // 23505: this id was already logged.
  if (error && error.code !== '23505') console.error('[ai-usage] could not log a call', entry.feature, error.message);
  return columns.cost_usd;
}

/** Fills in a reserved (pending) assistant message once it has run. */
export async function finishUsage(
  admin: SupabaseClient,
  usageId: string,
  entry: { model: string; usage: TokenUsage; meta?: Record<string, unknown> },
): Promise<void> {
  const { error } = await admin
    .from('ai_usage')
    .update({ status: 'done', meta: entry.meta ?? null, ...usageColumns(entry.model, entry.usage, false) })
    .eq('id', usageId);
  if (error) console.error('[ai-usage] could not finish', usageId, error.message);
}

/**
 * Releases a reserved message that never produced an answer, so it doesn't
 * count against the user. Tokens already spent are still recorded.
 */
export async function failUsage(
  admin: SupabaseClient,
  usageId: string,
  entry: { model: string; usage: TokenUsage; error: string },
): Promise<void> {
  const { error } = await admin
    .from('ai_usage')
    .update({ status: 'failed', meta: { error: entry.error }, ...usageColumns(entry.model, entry.usage, false) })
    .eq('id', usageId);
  if (error) console.error('[ai-usage] could not release', usageId, error.message);
}

/** The first moment of the current calendar month, UTC. Caps and the budget reset here. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface FeatureSpend {
  feature: AiFeature;
  calls: number;
  costUsd: number;
}

/** This month's AI spend per feature. Failed calls count toward cost (they still cost) but not toward calls. */
export async function spendThisMonth(admin: SupabaseClient): Promise<FeatureSpend[]> {
  const { data, error } = await admin.rpc('ai_spend_by_feature', { p_since: monthStart().toISOString() });
  if (error) throw new Error(`Couldn't read AI spend: ${error.message}`);
  return ((data ?? []) as { feature: AiFeature; calls: number; cost_usd: number | string }[]).map((r) => ({
    feature: r.feature,
    calls: r.calls,
    costUsd: Number(r.cost_usd),
  }));
}

export async function totalSpendThisMonth(admin: SupabaseClient): Promise<number> {
  return (await spendThisMonth(admin)).reduce((sum, f) => sum + f.costUsd, 0);
}
