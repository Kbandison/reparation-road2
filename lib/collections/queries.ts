import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection, CollectionRecord, RelatedRecord } from '@/lib/types';

interface CollectionFilters {
  category?: string;
  era?: string;
  region?: string;
}

export async function getCollections(
  supabase: SupabaseClient,
  filters?: CollectionFilters & { topLevelOnly?: boolean }
): Promise<Collection[]> {
  let query = supabase
    .from('collections')
    .select('*')
    .eq('is_published', true)
    .order('name');

  if (filters?.topLevelOnly) {
    query = query.is('parent_slug', null);
  }

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.era) query = query.eq('era', filters.era);
  if (filters?.region) query = query.eq('region', filters.region);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch collections:', error.message);
    return [];
  }
  return (data || []) as Collection[];
}

export async function getChildCollections(
  supabase: SupabaseClient,
  parentSlug: string
): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('parent_slug', parentSlug)
    .eq('is_published', true)
    .order('name');

  if (error) {
    console.error('Failed to fetch child collections:', error.message);
    return [];
  }
  return (data || []) as Collection[];
}

export async function getCollectionBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return null;
  return data as Collection;
}

interface RecordQueryOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function getCollectionRecords(
  supabase: SupabaseClient,
  collection: Collection,
  options: RecordQueryOptions = {}
): Promise<{ data: CollectionRecord[]; count: number }> {
  if (!collection.table_name) return { data: [], count: 0 };
  const { page = 1, pageSize = 25, search, sortBy, sortOrder = 'asc' } = options;

  let query = supabase
    .from(collection.table_name)
    .select('*', { count: 'exact' });

  if (collection.discriminator_column && collection.discriminator_value) {
    query = query.ilike(collection.discriminator_column, collection.discriminator_value);
  }

  if (search) {
    // Fetch all columns from a sample row so we can search every text field
    const { data: sampleData } = await supabase
      .from(collection.table_name)
      .select('*')
      .limit(1);

    const systemCols = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'image_path', 'image_url']);
    let searchCols: string[] = [];

    if (sampleData && sampleData.length > 0) {
      // Use all non-system columns that hold text-like values
      searchCols = Object.entries(sampleData[0])
        .filter(([key, val]) => !systemCols.has(key) && (typeof val === 'string' || val === null))
        .map(([key]) => key);
    }

    // Fall back to configured search_columns if we couldn't infer anything
    if (searchCols.length === 0 && collection.search_columns?.length > 0) {
      searchCols = collection.search_columns;
    }

    if (searchCols.length > 0) {
      const escaped = search.replace(/[%_,()]/g, '\\$&');
      const orFilter = searchCols.map((col) => `${col}.ilike.%${escaped}%`).join(',');
      query = query.or(orFilter);
    }
  }

  if (sortBy) {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  } else if (collection.display_columns?.length > 0) {
    query = query.order(collection.display_columns[0], { ascending: true });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to fetch collection records:', error.message);
    return { data: [], count: 0 };
  }

  const liveCount = count || 0;

  // Sync record_count if stale (fire-and-forget via admin client to bypass RLS)
  if (liveCount !== collection.record_count) {
    try {
      const admin = createAdminClient();
      admin
        .from('collections')
        .update({ record_count: liveCount })
        .eq('id', collection.id)
        .then();
    } catch { /* ignore — admin client may not be available in all envs */ }
  }

  return { data: (data || []) as unknown as CollectionRecord[], count: liveCount };
}

export async function getRecordBySlug(
  supabase: SupabaseClient,
  collection: Collection,
  recordSlug: string
): Promise<CollectionRecord | null> {
  if (!collection.table_name) return null;
  // Try slug first
  const { data: bySlug, error: slugError } = await supabase
    .from(collection.table_name)
    .select('*')
    .eq('slug', recordSlug)
    .maybeSingle();

  if (bySlug) return bySlug as CollectionRecord;

  // Fall back to id
  let idQuery = supabase
    .from(collection.table_name)
    .select('*')
    .eq('id', recordSlug);

  if (collection.discriminator_column && collection.discriminator_value) {
    idQuery = idQuery.ilike(collection.discriminator_column, collection.discriminator_value);
  }

  const { data: byId } = await idQuery.maybeSingle();
  return byId ? (byId as CollectionRecord) : null;
}

export async function getRelatedRecords(
  supabase: SupabaseClient,
  recordId: string,
  tableName: string
): Promise<RelatedRecord[]> {
  const { data, error } = await supabase
    .from('related_records')
    .select('*')
    .or(`source_record_id.eq.${recordId},target_record_id.eq.${recordId}`)
    .order('display_priority');

  if (error) return [];
  return (data || []) as RelatedRecord[];
}
