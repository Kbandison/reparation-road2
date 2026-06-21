import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlgorithmicMatch, Collection, CollectionRecord } from '@/lib/types';
import { retrieveCandidates } from './retrieval';
import { judgeCandidates, JUDGE_MODEL, type RelationshipType } from './judge';
import { saveMatches, type AiMatchRow, type NewAiMatch } from './cache';

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  same_person: 'Likely same person',
  family: 'Possible family',
  enslaver_enslaved: 'Enslaver / enslaved',
  same_household: 'Same household',
  same_event: 'Same event',
  same_place: 'Same place',
  associated: 'Associated',
  none: 'No clear link',
};

// A cached AI row, rendered in the existing AlgorithmicMatch shape so the
// current Related Records UI displays it with no changes. matchReasons carry
// the relationship label + the model's one-line reasoning.
export function aiMatchToAlgorithmic(row: AiMatchRow): AlgorithmicMatch {
  const label = RELATIONSHIP_LABELS[(row.relationship_type as RelationshipType)] ?? 'Related';
  const reasons = [label];
  if (row.reasoning) reasons.push(row.reasoning);
  return {
    id: row.target_record_id,
    slug: row.target_record_id,
    name: row.target_title || 'Untitled record',
    collectionSlug: row.target_collection_slug,
    collectionName: '',
    tableName: row.target_table,
    matchReasons: reasons,
    score: Math.round(row.confidence * 100),
  };
}

interface ComputeOptions {
  cutoff: number;
}

/**
 * Run the full pipeline for one source record: cross-column retrieval → AI
 * judge → persist verdicts (publishing those at/above the cutoff that aren't
 * "none"). Returns the freshly-saved rows.
 */
export async function computeMatches(
  supabase: SupabaseClient,
  sourceCollection: Collection,
  sourceRecord: CollectionRecord,
  { cutoff }: ComputeOptions,
): Promise<AiMatchRow[]> {
  if (!sourceCollection.table_name) return [];
  const sourceRecordId = String(sourceRecord.id);

  const { candidates } = await retrieveCandidates(supabase, sourceCollection, sourceRecord);
  const verdicts = await judgeCandidates(sourceCollection, sourceRecord, candidates);

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const rows: NewAiMatch[] = [];
  for (const v of verdicts) {
    const cand = byId.get(v.candidateId);
    if (!cand) continue;
    if (v.relationshipType === 'none') continue;
    rows.push({
      source_table: sourceCollection.table_name,
      source_record_id: sourceRecordId,
      source_collection_slug: sourceCollection.slug,
      target_table: cand.table,
      target_record_id: cand.id,
      target_collection_slug: cand.collectionSlug,
      target_title: cand.title,
      relationship_type: v.relationshipType,
      confidence: v.confidence,
      reasoning: v.reasoning,
      is_published: v.confidence >= cutoff,
      model: JUDGE_MODEL,
    });
  }

  await saveMatches(supabase, { recordId: sourceRecordId, table: sourceCollection.table_name }, rows, JUDGE_MODEL);

  // Return what we just saved (with synthetic ids/created_at filled by the
  // caller's subsequent read if needed). For the endpoint we only need the
  // published subset, which we reconstruct here to avoid a round-trip.
  return rows.map((r, i) => ({ ...r, id: `${sourceRecordId}-${i}`, created_at: new Date(0).toISOString() }));
}
