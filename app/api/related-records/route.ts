import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection, CollectionRecord, RelatedRecord, AlgorithmicMatch } from '@/lib/types';
import {
  extractMatchValues,
  findCandidateCollections,
  searchCandidateCollection,
  getDefaultConfig,
} from '@/lib/collections/matching';
import { getRecordTitle } from '@/lib/collections/helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('recordId');
  const tableName = searchParams.get('tableName');
  const collectionSlug = searchParams.get('collectionSlug');

  if (!recordId || !tableName || !collectionSlug) {
    return NextResponse.json(
      { error: 'recordId, tableName, and collectionSlug are required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const config = getDefaultConfig();

  // Step 1: Query curated related records
  const { data: curatedRaw } = await supabase
    .from('related_records')
    .select('*')
    .or(`source_record_id.eq.${recordId},target_record_id.eq.${recordId}`)
    .order('display_priority');

  const curated = (curatedRaw || []) as RelatedRecord[];

  // Re-derive source/target names live from the actual records so historical
  // relationships saved with bad titles (e.g. "austin_laurens" from a vessel
  // column) display the right person now that getRecordTitle is smarter.
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
      Promise.all(
        [...fetches.entries()].map(async ([k, p]) => [k, await p] as const),
      ),
      Promise.all(
        [...collectionFetches.entries()].map(async ([k, p]) => [k, await p] as const),
      ),
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

  // Step 2: Get source collection metadata
  const { data: collectionData } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', collectionSlug)
    .single();

  if (!collectionData) {
    return NextResponse.json({ curated, algorithmic: [] });
  }

  const collection = collectionData as Collection;

  // Step 3: Fetch the current record
  const { data: recordData } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', recordId)
    .maybeSingle();

  if (!recordData) {
    return NextResponse.json({ curated, algorithmic: [] });
  }

  const record = recordData as CollectionRecord;

  // Step 4: Extract match values
  const matchValues = extractMatchValues(record, collection);

  // If no match values extracted, return curated only
  if (
    matchValues.nameTokens.length === 0 &&
    matchValues.locations.length === 0 &&
    matchValues.dates.length === 0
  ) {
    return NextResponse.json({ curated, algorithmic: [] });
  }

  // Step 5: Find candidate collections and search in parallel
  const candidates = await findCandidateCollections(supabase, collection, config);

  const searchPromises = candidates.map((c) =>
    searchCandidateCollection(supabase, c, matchValues, config.maxResultsPerCollection)
  );

  // Race with a timeout of 3 seconds
  const results = await Promise.race([
    Promise.all(searchPromises),
    new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 3000)),
  ]);

  // Step 6: Flatten, deduplicate against curated, and limit
  const curatedIds = new Set([
    ...curated.map((r) => r.source_record_id),
    ...curated.map((r) => r.target_record_id),
  ]);
  curatedIds.add(recordId); // Exclude self

  const algorithmic: AlgorithmicMatch[] = results
    .flat()
    .filter((r) => !curatedIds.has(r.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxTotalAlgorithmic);

  return NextResponse.json({ curated, algorithmic });
}
