import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Collection,
  CollectionRecord,
  RelatedRecord,
  AlgorithmicMatch,
} from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractMatchValues,
  findCandidateCollections,
  searchCandidateCollection,
  getDefaultConfig,
} from '@/lib/collections/matching';
import { getRecordTitle } from '@/lib/collections/helpers';
import { getRelatedRecordsMode, getConfidenceCutoff } from '@/lib/related-ai/settings';
import { hasComputed, getCachedMatches } from '@/lib/related-ai/cache';
import { computeMatches, aiMatchToAlgorithmic } from '@/lib/related-ai/compute';

// AI compute (cross-collection search + model judging) runs in the background
// via after(), so allow the function room beyond the response.
export const maxDuration = 60;

// Live lexical matching — the original algorithm, factored out so it serves
// both 'algorithmic' mode and the "meanwhile" result while AI is computing.
async function computeLiveAlgorithmic(
  supabase: SupabaseClient,
  collection: Collection,
  record: CollectionRecord,
  excludeIds: Set<string>,
): Promise<AlgorithmicMatch[]> {
  const config = getDefaultConfig();
  const matchValues = extractMatchValues(record, collection);
  if (
    matchValues.nameTokens.length === 0 &&
    matchValues.locations.length === 0 &&
    matchValues.dates.length === 0
  ) {
    return [];
  }

  const candidates = await findCandidateCollections(supabase, collection, config);
  const searchPromises = candidates.map((c) =>
    searchCandidateCollection(supabase, c, matchValues, config.maxResultsPerCollection),
  );
  const results = await Promise.race([
    Promise.all(searchPromises),
    new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 3000)),
  ]);

  return results
    .flat()
    .filter((r) => !excludeIds.has(r.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxTotalAlgorithmic);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('recordId');
  const tableName = searchParams.get('tableName');
  const collectionSlug = searchParams.get('collectionSlug');

  if (!recordId || !tableName || !collectionSlug) {
    return NextResponse.json(
      { error: 'recordId, tableName, and collectionSlug are required' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const mode = await getRelatedRecordsMode(supabase);

  // Step 1: Curated related records (always shown, both modes).
  const { data: curatedRaw } = await supabase
    .from('related_records')
    .select('*')
    .or(`source_record_id.eq.${recordId},target_record_id.eq.${recordId}`)
    .order('display_priority');

  const curated = (curatedRaw || []) as RelatedRecord[];

  // Re-derive source/target names live so historical relationships saved with
  // bad titles display the right person now that getRecordTitle is smarter.
  if (curated.length > 0) {
    const fetches = new Map<string, Promise<Record<string, unknown> | null>>();
    const collectionFetches = new Map<string, Promise<Collection | null>>();

    const queueRow = (table: string, id: string) => {
      const key = `${table}::${id}`;
      if (!fetches.has(key)) {
        fetches.set(
          key,
          (async () => {
            const r = await supabase.from(table).select('*').eq('id', id).maybeSingle();
            return (r.data as Record<string, unknown> | null) ?? null;
          })(),
        );
      }
    };
    const queueCollection = (slug: string) => {
      if (!collectionFetches.has(slug)) {
        collectionFetches.set(
          slug,
          (async () => {
            const r = await supabase.from('collections').select('*').eq('slug', slug).maybeSingle();
            return (r.data as Collection | null) ?? null;
          })(),
        );
      }
    };

    for (const rel of curated) {
      if (rel.source_table && rel.source_record_id) queueRow(rel.source_table, rel.source_record_id);
      if (rel.target_table && rel.target_record_id) queueRow(rel.target_table, rel.target_record_id);
      if (rel.source_collection_slug) queueCollection(rel.source_collection_slug);
      if (rel.target_collection_slug) queueCollection(rel.target_collection_slug);
    }

    const [rowEntries, collectionEntries] = await Promise.all([
      Promise.all([...fetches.entries()].map(async ([k, p]) => [k, await p] as const)),
      Promise.all([...collectionFetches.entries()].map(async ([k, p]) => [k, await p] as const)),
    ]);
    const rowMap = new Map(rowEntries);
    const collectionMap = new Map(collectionEntries);

    for (const rel of curated) {
      const srcRow = rowMap.get(`${rel.source_table}::${rel.source_record_id}`);
      const srcCol = collectionMap.get(rel.source_collection_slug);
      if (srcRow && srcCol) rel.source_name = getRecordTitle(srcRow, srcCol);

      const tgtRow = rowMap.get(`${rel.target_table}::${rel.target_record_id}`);
      const tgtCol = collectionMap.get(rel.target_collection_slug);
      if (tgtRow && tgtCol) rel.target_name = getRecordTitle(tgtRow, tgtCol);
    }
  }

  const curatedIds = new Set<string>([
    ...curated.map((r) => r.source_record_id),
    ...curated.map((r) => r.target_record_id),
    recordId, // exclude self
  ]);

  // Step 2: Source collection + record (needed by both matchers).
  const { data: collectionData } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', collectionSlug)
    .single();
  if (!collectionData) return NextResponse.json({ curated, algorithmic: [], mode });
  const collection = collectionData as Collection;

  const { data: recordData } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', recordId)
    .maybeSingle();
  if (!recordData) return NextResponse.json({ curated, algorithmic: [], mode });
  const record = recordData as CollectionRecord;

  // Step 3: AI mode — serve cached verdicts; compute in the background on miss.
  if (mode === 'ai') {
    const cutoff = await getConfidenceCutoff(supabase);

    if (await hasComputed(supabase, recordId)) {
      const rows = await getCachedMatches(supabase, recordId, { publishedOnly: true });
      const algorithmic = rows
        .filter((r) => !curatedIds.has(r.target_record_id))
        .map(aiMatchToAlgorithmic);
      return NextResponse.json({ curated, algorithmic, mode: 'ai', source: 'ai' });
    }

    // First view: kick off the AI run after the response, show live lexical
    // results meanwhile. The next view will read the cached AI matches.
    after(async () => {
      try {
        await computeMatches(supabase, collection, record, { cutoff });
      } catch {
        // Swallow — a failed background run simply leaves the cache empty and
        // the next view retries.
      }
    });

    const algorithmic = await computeLiveAlgorithmic(supabase, collection, record, curatedIds);
    return NextResponse.json({ curated, algorithmic, mode: 'ai', source: 'pending' });
  }

  // Step 4: Algorithmic mode (default, today's behavior).
  const algorithmic = await computeLiveAlgorithmic(supabase, collection, record, curatedIds);
  return NextResponse.json({ curated, algorithmic, mode: 'algorithmic', source: 'algorithmic' });
}
