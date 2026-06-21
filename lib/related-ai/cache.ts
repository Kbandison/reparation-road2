import type { SupabaseClient } from '@supabase/supabase-js';

// Read/write layer for the AI related-records cache (ai_related_records) and
// the per-record run marker (ai_related_runs). The run marker lets us tell a
// genuine "computed, found nothing" from a "never computed" so we don't
// re-run the model on every view of a record that has no matches.

export interface AiMatchRow {
  id: string;
  source_table: string;
  source_record_id: string;
  source_collection_slug: string;
  target_table: string;
  target_record_id: string;
  target_collection_slug: string;
  target_title: string | null;
  relationship_type: string | null;
  confidence: number;
  reasoning: string | null;
  is_published: boolean;
  model: string | null;
  created_at: string;
}

export type NewAiMatch = Omit<AiMatchRow, 'id' | 'created_at'>;

export async function hasComputed(
  supabase: SupabaseClient,
  sourceRecordId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('ai_related_runs')
      .select('source_record_id')
      .eq('source_record_id', sourceRecordId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function getCachedMatches(
  supabase: SupabaseClient,
  sourceRecordId: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<AiMatchRow[]> {
  try {
    let query = supabase
      .from('ai_related_records')
      .select('*')
      .eq('source_record_id', sourceRecordId);
    if (opts.publishedOnly) query = query.eq('is_published', true);

    const { data, error } = await query.order('confidence', { ascending: false });
    if (error || !data) return [];
    return data as AiMatchRow[];
  } catch {
    return [];
  }
}

/**
 * Replace the cached matches for a source record and stamp its run marker.
 * Delete-then-insert keeps a regenerate clean (old verdicts don't linger).
 */
export async function saveMatches(
  supabase: SupabaseClient,
  source: { recordId: string; table: string },
  rows: NewAiMatch[],
  model: string,
): Promise<void> {
  await supabase.from('ai_related_records').delete().eq('source_record_id', source.recordId);

  if (rows.length > 0) {
    await supabase.from('ai_related_records').insert(rows);
  }

  await supabase.from('ai_related_runs').upsert(
    {
      source_record_id: source.recordId,
      source_table: source.table,
      computed_at: new Date().toISOString(),
      model,
    },
    { onConflict: 'source_record_id' },
  );
}
