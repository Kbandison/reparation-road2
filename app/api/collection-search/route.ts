import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection } from '@/lib/types';

interface RecordResult {
  id: string;
  slug?: string;
  collectionSlug: string;
  collectionName: string;
  parentSlug: string | null;
  matchField: string;
  matchValue: string;
  displayFields: Record<string, string>;
  score: number;
}

interface CollectionRecordGroup {
  collectionSlug: string;
  collectionName: string;
  parentSlug: string | null;
  parentName: string | null;
  total: number;
  records: RecordResult[];
}

const SYSTEM_COLS = new Set([
  'id',
  'slug',
  'created_at',
  'updated_at',
  'embedding',
  'tsv',
  'collection_tag',
  'image_path',
  'image_url',
]);

const PER_COLLECTION_LIMIT = 10;

// Split a user-typed query into search tokens. Multi-token queries become
// AND-of-OR filters: every token must appear in at least one searched column.
// This lets "John Smith" match rows where the name is stored as
// "Smith, John" or "John P. Smith" (different word order, extra middle data).
function tokenizeQuery(q: string): string[] {
  return q
    .trim()
    .split(/[\s,.;:()/\\-]+/)
    .map((t) => t.replace(/[%,]/g, ''))
    .filter((t) => t.length >= 2);
}

// Sanitize a value going into a PostgREST or() filter. ILIKE wildcards (%)
// and the OR separator (,) need to be stripped so users typing them don't
// break the query string.
function safeForOr(s: string): string {
  return s.replace(/[%,]/g, '');
}

// Score a record match so we can sort by relevance within a collection.
// Higher is better. Tuned for genealogical search patterns: name fields beat
// remarks/notes, prefix matches beat mid-string matches, exact matches win.
function scoreMatch(
  matchField: string,
  matchValue: string,
  searchColumns: string[],
  lowerQuery: string,
): number {
  let score = 0;

  // Field importance
  if (matchField === 'name' || matchField.endsWith('_name') || matchField === 'head_of_family') {
    score += 100;
  } else if (searchColumns.includes(matchField)) {
    score += 60;
  } else {
    score += 20;
  }

  const lowerVal = matchValue.toLowerCase();
  const pos = lowerVal.indexOf(lowerQuery);

  // Position bonus
  if (pos === 0) score += 30;
  else if (pos < 20) score += 10;

  // Whole-field exact match
  if (lowerVal === lowerQuery) score += 25;

  // Word-boundary match (e.g. " cherokee " vs "cherokeeville")
  if (pos > 0) {
    const prevChar = lowerVal[pos - 1];
    if (/\s|[.,;:()\-/]/.test(prevChar)) score += 8;
  }

  // Length penalty for huge OCR-style values where the query was incidental.
  if (matchValue.length > 500) score -= 10;
  else if (matchValue.length < 80) score += 5;

  return score;
}

async function countCollectionMatches(
  supabase: ReturnType<typeof createAdminClient>,
  tableName: string,
  col: Collection,
  expandedSearchCols: string[],
  query: string,
): Promise<number> {
  const tokens = tokenizeQuery(query);
  const effectiveTokens = tokens.length > 0 ? tokens : [safeForOr(query.trim())];

  let q = supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true });

  // Each chained .or() AND's with the previous: every token must appear
  // somewhere in the searched columns.
  for (const token of effectiveTokens) {
    const orFilter = expandedSearchCols.map((c) => `${c}.ilike.%${token}%`).join(',');
    q = q.or(orFilter);
  }

  if (col.discriminator_column && col.discriminator_value) {
    q = q.eq(col.discriminator_column, col.discriminator_value);
  }

  try {
    const { count } = await q;
    return count || 0;
  } catch {
    return 0;
  }
}

async function searchTable(
  supabase: ReturnType<typeof createAdminClient>,
  tableName: string,
  cols: Collection[],
  query: string,
  lowerQuery: string,
  perCollectionLimit: number,
  offset: number,
  filterCollectionSlug: string | null,
) {
  // Pull every text column from the table for both search and display. Keep
  // the unfiltered list too, so we know which columns actually exist (some
  // tables have no `slug`, and metadata can reference columns that were
  // renamed) — selecting a non-existent column 400s the whole query.
  let rawCols: string[] = [];
  let textCols: string[] = [];
  try {
    const { data: colData } = await supabase.rpc('get_text_columns', { p_table_name: tableName });
    if (colData) {
      rawCols = (colData as { column_name: string }[]).map((c) => c.column_name);
      textCols = rawCols.filter((c) => !SYSTEM_COLS.has(c));
    }
  } catch {
    // RPC may not exist
  }

  const allSearchCols = [...new Set(cols.flatMap((c) => c.search_columns))];
  const allDisplayCols = [...new Set(cols.flatMap((c) => c.display_columns))];

  const expandedSearchCols = textCols.length > 0
    ? textCols
    : [...new Set([...allSearchCols, ...allDisplayCols])].filter((c) => !SYSTEM_COLS.has(c));

  if (expandedSearchCols.length === 0) {
    return { groups: [] as CollectionRecordGroup[] };
  }

  // Build the SELECT from columns that actually exist. `id` always does; `slug`
  // and the discriminator/display columns only when the table really has them.
  const realSet = rawCols.length > 0 ? new Set([...rawCols, 'id']) : null;
  const exists = (c: string) => !realSet || realSet.has(c);
  const discriminatorCols = cols
    .filter((c) => c.discriminator_column)
    .map((c) => c.discriminator_column!);
  const selectColsSet = new Set<string>(['id']);
  if (exists('slug')) selectColsSet.add('slug');
  for (const c of [...expandedSearchCols, ...allDisplayCols, ...discriminatorCols]) {
    if (exists(c)) selectColsSet.add(c);
  }
  const uniqueSelect = [...selectColsSet].join(',');

  const tokens = tokenizeQuery(query);
  const effectiveTokens = tokens.length > 0 ? tokens : [safeForOr(query.trim())];

  // Fetch generously above per-collection limit so the JS-side bucketing per
  // sub-collection still has plenty to choose from for shared-table cases.
  // When paginating a single collection, fetch deep enough to reach the
  // requested offset window even on collections with thousands of hits.
  const fetchLimit = filterCollectionSlug
    ? Math.max(offset + perCollectionLimit * 4, 1000)
    : Math.max(perCollectionLimit * Math.max(cols.length, 1) * 3, 200);

  type RawRow = Record<string, unknown> & { id: string; slug?: string };
  let rows: RawRow[] = [];

  // Per-collection count queries run in parallel with the data query.
  const countPromises = cols.map(async (col) => {
    if (filterCollectionSlug && col.slug !== filterCollectionSlug) return [col.slug, 0] as const;
    const total = await countCollectionMatches(supabase, tableName, col, expandedSearchCols, query);
    return [col.slug, total] as const;
  });

  const [dataResp, countEntries] = await Promise.all([
    (async () => {
      const run = (sel: string) => {
        let q = supabase.from(tableName).select(sel);
        for (const token of effectiveTokens) {
          q = q.or(expandedSearchCols.map((c) => `${c}.ilike.%${token}%`).join(','));
        }
        return q.limit(fetchLimit);
      };
      try {
        let res = await run(uniqueSelect);
        // A stale column in the SELECT (e.g. a table with no `slug`) 400s the
        // whole query — fall back to all columns so the table still returns.
        if (res.error) res = await run('*');
        return res;
      } catch {
        return { data: null, error: { message: 'query failed' } };
      }
    })(),
    Promise.all(countPromises),
  ]);

  if (dataResp.error || !dataResp.data) return { groups: [] as CollectionRecordGroup[] };
  rows = dataResp.data as unknown as RawRow[];
  const totalsBySlug = new Map(countEntries);

  // Bucket rows by which collection they belong to (via discriminator) and
  // build relevance-scored RecordResults.
  const buckets = new Map<string, RecordResult[]>();
  for (const col of cols) buckets.set(col.slug, []);

  for (const row of rows) {
    // Pick the collection this row belongs to
    let matchCol = cols[0];
    for (const c of cols) {
      if (
        c.discriminator_column &&
        c.discriminator_value &&
        String(row[c.discriminator_column]).toLowerCase() === c.discriminator_value.toLowerCase()
      ) {
        matchCol = c;
        break;
      }
      if (!c.discriminator_column) {
        matchCol = c;
      }
    }

    if (filterCollectionSlug && matchCol.slug !== filterCollectionSlug) continue;

    // Find a column to use as the headline match. Priority: configured
    // search_columns first (so a name match is reported as a name match
    // even if the term also appears in ocr_text). For multi-token queries
    // we prefer a column that contains the most tokens — that tends to be
    // the actual name field rather than incidental remarks.
    const orderedCols = [
      ...matchCol.search_columns.filter((c) => expandedSearchCols.includes(c)),
      ...expandedSearchCols.filter((c) => !matchCol.search_columns.includes(c)),
    ];
    let matchField = '';
    let matchValue = '';
    let matchTokenCount = 0;
    for (const col of orderedCols) {
      const val = row[col];
      if (!val || typeof val !== 'string') continue;
      const lowerVal = val.toLowerCase();
      const hits = effectiveTokens.filter((t) => lowerVal.includes(t)).length;
      if (hits > matchTokenCount) {
        matchField = col;
        matchValue = val;
        matchTokenCount = hits;
        if (hits === effectiveTokens.length) break;
      }
    }
    if (!matchField) continue;

    const displayFields: Record<string, string> = {};
    for (const col of matchCol.display_columns.slice(0, 4)) {
      const val = row[col];
      if (val !== undefined && val !== null) {
        displayFields[col] = String(val);
      }
    }

    // Count how many distinct tokens hit anywhere in the row, so a record
    // matching "John AND Smith" beats one only matching "John".
    let totalTokenHits = 0;
    if (effectiveTokens.length > 1) {
      for (const t of effectiveTokens) {
        let found = false;
        for (const col of orderedCols) {
          const v = row[col];
          if (v && typeof v === 'string' && v.toLowerCase().includes(t)) {
            found = true;
            break;
          }
        }
        if (found) totalTokenHits++;
      }
    }

    let score = scoreMatch(matchField, matchValue, matchCol.search_columns, lowerQuery);
    if (totalTokenHits >= effectiveTokens.length && effectiveTokens.length > 1) {
      score += 40; // every token covered — a strong, intentional match
    } else if (totalTokenHits >= 2) {
      score += 15;
    }

    buckets.get(matchCol.slug)!.push({
      id: row.id,
      slug: row.slug || row.id,
      collectionSlug: matchCol.slug,
      collectionName: matchCol.name,
      parentSlug: matchCol.parent_slug,
      matchField,
      matchValue,
      displayFields,
      score,
    });
  }

  // Sort each bucket by score, then slice for pagination.
  const groups: CollectionRecordGroup[] = [];
  for (const col of cols) {
    if (filterCollectionSlug && col.slug !== filterCollectionSlug) continue;
    const matched = buckets.get(col.slug) || [];
    matched.sort((a, b) => b.score - a.score);
    const total = totalsBySlug.get(col.slug) ?? matched.length;
    if (total === 0 && matched.length === 0) continue;
    groups.push({
      collectionSlug: col.slug,
      collectionName: col.name,
      parentSlug: col.parent_slug,
      parentName: null, // filled in by caller from collections list
      total,
      records: matched.slice(offset, offset + perCollectionLimit),
    });
  }

  return { groups };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const filterCollectionSlug = searchParams.get('collection');
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

  if (!query || query.length < 2) {
    return NextResponse.json({ collections: [], subcollections: [], records: [] });
  }

  const supabase = createAdminClient();

  // 1. Fetch all published collections
  const { data: allCollections } = await supabase
    .from('collections')
    .select('*')
    .eq('is_published', true)
    .order('sort_order');

  const collections = (allCollections || []) as Collection[];
  const collectionByslug = new Map(collections.map((c) => [c.slug, c]));

  const lowerQuery = query.toLowerCase();

  // 2. Search collection/subcollection names — only on initial (unfiltered) calls.
  const matchingCollections = filterCollectionSlug
    ? []
    : collections.filter(
        (c) =>
          !c.parent_slug &&
          (c.name.toLowerCase().includes(lowerQuery) ||
            c.short_description?.toLowerCase().includes(lowerQuery) ||
            c.category.toLowerCase().includes(lowerQuery))
      );

  const matchingSubcollections = filterCollectionSlug
    ? []
    : collections.filter(
        (c) =>
          c.parent_slug &&
          (c.name.toLowerCase().includes(lowerQuery) ||
            c.short_description?.toLowerCase().includes(lowerQuery))
      );

  // 3. Search records across data collections
  const dataCollections = collections.filter(
    (c) => c.table_name && c.search_columns && c.search_columns.length > 0,
  );

  const tableGroups = new Map<string, Collection[]>();
  for (const col of dataCollections) {
    if (filterCollectionSlug && col.slug !== filterCollectionSlug) continue;
    const existing = tableGroups.get(col.table_name!) || [];
    existing.push(col);
    tableGroups.set(col.table_name!, existing);
  }

  const allGroups: CollectionRecordGroup[] = [];

  await Promise.all(
    Array.from(tableGroups.entries()).map(async ([tableName, cols]) => {
      const { groups } = await searchTable(
        supabase,
        tableName,
        cols,
        query,
        lowerQuery,
        PER_COLLECTION_LIMIT,
        filterCollectionSlug ? offset : 0,
        filterCollectionSlug,
      );
      for (const g of groups) {
        const parent = g.parentSlug ? collectionByslug.get(g.parentSlug) : null;
        g.parentName = parent ? parent.name : null;
        allGroups.push(g);
      }
    }),
  );

  // Sort groups: by collection sort_order so users see results in a stable
  // hierarchy-like order rather than whichever query returned first.
  allGroups.sort((a, b) => {
    const ca = collectionByslug.get(a.collectionSlug)?.sort_order ?? 999;
    const cb = collectionByslug.get(b.collectionSlug)?.sort_order ?? 999;
    return ca - cb;
  });

  return NextResponse.json({
    collections: matchingCollections.map((c) => ({
      slug: c.slug,
      name: c.name,
      shortDescription: c.short_description,
      category: c.category,
      recordCount: c.record_count,
      accessTier: c.access_tier,
    })),
    subcollections: matchingSubcollections.map((c) => ({
      slug: c.slug,
      name: c.name,
      shortDescription: c.short_description,
      parentSlug: c.parent_slug,
      parentName: collections.find((p) => p.slug === c.parent_slug)?.name || '',
      category: c.category,
      recordCount: c.record_count,
      accessTier: c.access_tier,
    })),
    records: allGroups,
  });
}
