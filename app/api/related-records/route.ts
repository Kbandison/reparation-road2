import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection, CollectionRecord, RelatedRecord, AlgorithmicMatch } from '@/lib/types';
import {
  extractMatchValues,
  findCandidateCollections,
  searchCandidateCollection,
  getDefaultConfig,
} from '@/lib/collections/matching';

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
