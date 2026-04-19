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
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

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

  // 2. Search collection/subcollection names
  const lowerQuery = query.toLowerCase();
  const matchingCollections = collections.filter(
    (c) =>
      !c.parent_slug &&
      (c.name.toLowerCase().includes(lowerQuery) ||
        c.short_description?.toLowerCase().includes(lowerQuery) ||
        c.category.toLowerCase().includes(lowerQuery))
  );

  const matchingSubcollections = collections.filter(
    (c) =>
      c.parent_slug &&
      (c.name.toLowerCase().includes(lowerQuery) ||
        c.short_description?.toLowerCase().includes(lowerQuery))
  );

  // 3. Search records across all data collections (those with table_name and search_columns)
  const dataCollections = collections.filter(
    (c) => c.table_name && c.search_columns && c.search_columns.length > 0
  );

  // Group by table_name to avoid duplicate queries on the same table
  const tableGroups = new Map<string, Collection[]>();
  for (const col of dataCollections) {
    const existing = tableGroups.get(col.table_name!) || [];
    existing.push(col);
    tableGroups.set(col.table_name!, existing);
  }

  const recordResults: RecordResult[] = [];
  const maxRecordsPerTable = 5;

  const searchPromises = Array.from(tableGroups.entries()).map(
    async ([tableName, cols]) => {
      // Collect all unique search columns across collections sharing this table
      const allSearchCols = [...new Set(cols.flatMap((c) => c.search_columns))];
      const allDisplayCols = [...new Set(cols.flatMap((c) => c.display_columns))];

      // Fetch a sample row to discover ALL text columns in the table
      const systemCols = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'collection_tag', 'image_path', 'image_url']);
      let tableTextCols: string[] = [];
      const { data: sample } = await supabase.from(tableName).select('*').limit(1);
      if (sample && sample.length > 0) {
        tableTextCols = Object.entries(sample[0])
          .filter(([key, val]) => !systemCols.has(key) && (typeof val === 'string' || val === null))
          .map(([key]) => key);
      }

      // Expanded search set: union of configured search_columns + discovered text columns
      const expandedSearchCols = [...new Set([...allSearchCols, ...tableTextCols])];

      // Build select columns
      const selectCols = [
        'id',
        'slug',
        ...new Set([...expandedSearchCols, ...allDisplayCols]),
      ];

      // Add discriminator columns
      const discriminatorCols = cols
        .filter((c) => c.discriminator_column)
        .map((c) => c.discriminator_column!);
      discriminatorCols.forEach((dc) => selectCols.push(dc));

      const uniqueSelect = [...new Set(selectCols)].join(',');

      const escaped = query.replace(/[%_,()]/g, '\\$&');
      const orFilter = expandedSearchCols
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(',');

      try {
        const { data, error } = await supabase
          .from(tableName)
          .select(uniqueSelect)
          .or(orFilter)
          .limit(maxRecordsPerTable * cols.length);

        if (error || !data) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of data as any[]) {
          // Determine which collection this row belongs to
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

          // Find which field matched
          let matchField = '';
          let matchValue = '';
          for (const col of matchCol.search_columns) {
            const val = row[col];
            if (
              val &&
              typeof val === 'string' &&
              val.toLowerCase().includes(lowerQuery)
            ) {
              matchField = col;
              matchValue = val;
              break;
            }
          }

          if (!matchField) continue;

          // Build display fields
          const displayFields: Record<string, string> = {};
          for (const col of matchCol.display_columns.slice(0, 4)) {
            if (row[col] !== undefined && row[col] !== null) {
              displayFields[col] = String(row[col]);
            }
          }

          recordResults.push({
            id: row.id,
            slug: row.slug || row.id,
            collectionSlug: matchCol.slug,
            collectionName: matchCol.name,
            parentSlug: matchCol.parent_slug,
            matchField,
            matchValue,
            displayFields,
          });
        }
      } catch {
        // Skip tables that error
      }
    }
  );

  await Promise.all(searchPromises);

  // Limit total records returned
  const limitedRecords = recordResults.slice(0, 30);

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
    records: limitedRecords,
  });
}
