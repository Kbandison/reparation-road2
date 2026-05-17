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
  const tableName = collection.table_name;
  const { page = 1, pageSize = 25, search, sortBy, sortOrder = 'asc' } = options;

  // A collection may pin its records to a fixed natural order (the original
  // document/spreadsheet order) via `sort_columns`. When set — and the request
  // isn't an explicit column sort — records are returned in exactly that order
  // with no illegible-last partitioning. Otherwise the listing is ordered by an
  // explicit sortBy, else the first display column.
  const naturalSort =
    !sortBy && Array.isArray(collection.sort_columns) && collection.sort_columns.length > 0
      ? collection.sort_columns
      : null;
  const orderColumn = naturalSort ? null : sortBy || collection.display_columns?.[0] || null;
  const ascending = sortOrder === 'asc';

  // Resolve the table's text columns once — used both for search and to
  // decide whether the order column can be illegible-partitioned. ILIKE only
  // works on text columns; running it on an integer/date column throws.
  const systemCols = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'collection_tag', 'image_path', 'image_url']);
  let textColumns: string[] | null = null;
  try {
    const { data: colData } = await supabase.rpc('get_text_columns', { p_table_name: tableName });
    if (colData) {
      textColumns = (colData as { column_name: string }[]).map((c) => c.column_name);
    }
  } catch {
    // RPC may not exist yet
  }

  let searchCols: string[] = [];
  if (search) {
    searchCols = (textColumns ?? []).filter((c) => !systemCols.has(c));
    if (searchCols.length === 0) {
      searchCols = [...new Set([
        ...(collection.display_columns || []),
        ...(collection.search_columns || []),
      ])].filter((c) => !systemCols.has(c));
    }
  }

  // The illegible-last partitioning uses ILIKE, so it only applies when the
  // order column is text. Numeric/date columns fall back to a plain query.
  const orderColumnIsText =
    !!orderColumn && !!textColumns && textColumns.includes(orderColumn);

  // A fresh query carrying the discriminator + search filters. `head` returns
  // just the row count (no rows) for the partition-sizing queries.
  const baseQuery = (head = false) => {
    let q = supabase.from(tableName).select('*', { count: 'exact', head });
    if (collection.discriminator_column && collection.discriminator_value) {
      q = q.ilike(collection.discriminator_column, collection.discriminator_value);
    }
    if (search && searchCols.length > 0) {
      const safe = search.replace(/,/g, '');
      q = q.or(searchCols.map((col) => `${col}.ilike.%${safe}%`).join(','));
    }
    return q;
  };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let rows: Record<string, unknown>[] = [];
  let liveCount = 0;
  let queryError: { message: string } | null = null;

  if (naturalSort) {
    // Original document order — order by each sort column in sequence,
    // ascending, with no illegible-last partitioning.
    let q = baseQuery();
    for (const col of naturalSort) q = q.order(col, { ascending: true });
    const { data, count, error } = await q.range(from, to);
    rows = data || [];
    liveCount = count || 0;
    queryError = error;
  } else if (orderColumn && orderColumnIsText) {
    // Records whose ordering column reads "[illegible]" — an unreadable name in
    // the source document — sort after every legible record, no matter which
    // page they land on. Done as two partitions so it survives pagination
    // (PostgREST can't ORDER BY a CASE expression).
    // Match on the "illeg" stem rather than the full word so transcription
    // typos (e.g. "[Illegilbe]") are still pushed to the tail.
    const ILLEGIBLE = '%illeg%';
    const legiblePredicate = `${orderColumn}.not.ilike.${ILLEGIBLE},${orderColumn}.is.null`;

    const [legibleCountRes, illegibleCountRes] = await Promise.all([
      baseQuery(true).or(legiblePredicate),
      baseQuery(true).ilike(orderColumn, ILLEGIBLE),
    ]);
    const legibleTotal = legibleCountRes.count || 0;
    liveCount = legibleTotal + (illegibleCountRes.count || 0);
    queryError = legibleCountRes.error || illegibleCountRes.error;

    const dataQueries = [
      ...(from < legibleTotal
        ? [baseQuery()
            .or(legiblePredicate)
            .order(orderColumn, { ascending })
            .range(from, Math.min(to, legibleTotal - 1))]
        : []),
      ...(to >= legibleTotal
        ? [baseQuery()
            .ilike(orderColumn, ILLEGIBLE)
            .order(orderColumn, { ascending })
            .range(Math.max(0, from - legibleTotal), to - legibleTotal)]
        : []),
    ];

    for (const res of await Promise.all(dataQueries)) {
      if (res.error) queryError = queryError || res.error;
      if (res.data) rows = rows.concat(res.data);
    }
  } else if (orderColumn) {
    // Non-text order column (e.g. an integer like inspection_roll.book) —
    // plain ordered query; ILIKE partitioning would error on a numeric column.
    const { data, count, error } = await baseQuery()
      .order(orderColumn, { ascending })
      .range(from, to);
    rows = data || [];
    liveCount = count || 0;
    queryError = error;
  } else {
    const { data, count, error } = await baseQuery().range(from, to);
    rows = data || [];
    liveCount = count || 0;
    queryError = error;
  }

  if (queryError) {
    console.error('Failed to fetch collection records:', queryError.message);
    return { data: [], count: 0 };
  }

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

  return { data: rows as unknown as CollectionRecord[], count: liveCount };
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
