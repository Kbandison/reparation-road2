import type { SupabaseClient } from '@supabase/supabase-js';

// Small typed accessor over the app_settings key-value table. Used for the
// reversible related-records mode toggle and the AI confidence cutoff.

export type RelatedRecordsMode = 'algorithmic' | 'ai';

const MODE_KEY = 'related_records_mode';
const CUTOFF_KEY = 'related_records_confidence';

export const DEFAULT_MODE: RelatedRecordsMode = 'algorithmic';
export const DEFAULT_CUTOFF = 0.7;

async function getSetting<T>(
  supabase: SupabaseClient,
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    // Missing table/row → fall back to the default (keeps today's behavior
    // until the migration is run).
    if (error || !data) return fallback;
    return (data.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
): Promise<void> {
  await supabase
    .from('app_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
}

export async function getRelatedRecordsMode(
  supabase: SupabaseClient,
): Promise<RelatedRecordsMode> {
  const mode = await getSetting<RelatedRecordsMode>(supabase, MODE_KEY, DEFAULT_MODE);
  return mode === 'ai' ? 'ai' : 'algorithmic';
}

export async function setRelatedRecordsMode(
  supabase: SupabaseClient,
  mode: RelatedRecordsMode,
): Promise<void> {
  await setSetting(supabase, MODE_KEY, mode);
}

export async function getConfidenceCutoff(supabase: SupabaseClient): Promise<number> {
  const v = await getSetting<number>(supabase, CUTOFF_KEY, DEFAULT_CUTOFF);
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : DEFAULT_CUTOFF;
}

export async function setConfidenceCutoff(
  supabase: SupabaseClient,
  cutoff: number,
): Promise<void> {
  const clamped = Math.max(0, Math.min(1, cutoff));
  await setSetting(supabase, CUTOFF_KEY, clamped);
}
