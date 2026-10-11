import type { SupabaseClient } from '@supabase/supabase-js';
import type { TreeArchiveMatch } from '@/lib/types';
import { getRecordTitle, imagePathOf } from '@/lib/collections/helpers';
import { formatFieldValue, snakeCaseToTitleCase } from '@/lib/utils/format';

// Server-only: reads collection tables and writes tree rows with the caller's
// Supabase client. Never import from a client component.

/**
 * Archive records saved to a person live in tree_individual_matches with
 * status 'linked' (a person can have any number). The person's own
 * archive_* fields mirror the first one, which lights the link badge on the
 * tree canvas, so they're re-derived after every save or removal.
 */
export async function syncArchivePointer(supabase: SupabaseClient, individualId: string, userId: string) {
  const { data } = await supabase
    .from('tree_individual_matches')
    .select('collection_slug, record_id, title')
    .eq('individual_id', individualId)
    .eq('status', 'linked')
    .order('created_at')
    .limit(1);
  const first = data?.[0];
  await supabase
    .from('tree_individuals')
    .update({
      archive_collection_slug: first?.collection_slug ?? null,
      archive_record_id: first?.record_id ?? null,
      archive_record_title: first?.title ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', individualId)
    .eq('user_id', userId);
}

/** Everything the save endpoint needs about a record, or null when it can't be saved. */
export async function resolveRecord(supabase: SupabaseClient, collectionSlug: string, recordId: string) {
  const { data: collection } = await supabase
    .from('collections')
    .select('slug, name, table_name, display_columns, title_columns, discriminator_column, discriminator_value, is_published')
    .eq('slug', collectionSlug)
    .maybeSingle();
  if (!collection?.table_name || !collection.is_published) return null;

  // One row by id; the column set varies by table, so select it whole.
  let query = supabase.from(collection.table_name).select('*').eq('id', recordId);
  if (collection.discriminator_column && collection.discriminator_value) {
    query = query.ilike(collection.discriminator_column, collection.discriminator_value);
  }
  const { data: record } = await query.maybeSingle();
  if (!record) return null;

  const row = record as Record<string, unknown>;
  const slug = typeof row.slug === 'string' && row.slug ? row.slug : null;
  return {
    collection,
    recordId: String(row.id),
    recordSlug: slug,
    title: getRecordTitle(row, collection),
    detailUrl: `/collection/${collection.slug}?record=${encodeURIComponent(slug ?? String(row.id))}`,
  };
}

export interface SavedRecordPreview {
  matchId: string;
  collectionSlug: string;
  collectionName: string;
  title: string;
  detailUrl: string;
  /** The record's scan (stored image_path or image_url), when it has one. */
  imagePath: string | null;
  /** A few of the collection's display columns, for the card. */
  details: { label: string; value: string }[];
  /** The record has since been removed from the archive. */
  missing: boolean;
}

const MAX_DETAILS = 3;

/**
 * The cards on a person's profile: each saved record with its scan and a few
 * key fields, read live so edits to the archive show up. One query per
 * collection involved.
 */
export async function loadSavedRecordPreviews(
  supabase: SupabaseClient,
  saved: TreeArchiveMatch[],
): Promise<SavedRecordPreview[]> {
  if (saved.length === 0) return [];
  const slugs = [...new Set(saved.map((m) => m.collection_slug))];
  const { data: collections } = await supabase
    .from('collections')
    .select('slug, name, table_name, display_columns, title_columns')
    .in('slug', slugs);
  const bySlug = new Map((collections ?? []).map((c) => [c.slug, c]));

  const records = new Map<string, Record<string, unknown>>();
  await Promise.all(
    slugs.map(async (slug) => {
      const collection = bySlug.get(slug);
      if (!collection?.table_name) return;
      const ids = saved.filter((m) => m.collection_slug === slug).map((m) => m.record_id);
      // A handful of rows by id, not a list view, so the whole row is fine.
      const { data } = await supabase.from(collection.table_name).select('*').in('id', ids);
      for (const row of (data ?? []) as Record<string, unknown>[]) records.set(`${slug}:${row.id}`, row);
    }),
  );

  return saved.map((m) => {
    const collection = bySlug.get(m.collection_slug);
    const record = records.get(`${m.collection_slug}:${m.record_id}`);
    const title = record && collection ? getRecordTitle(record, collection) : m.title || 'Record';
    const details: { label: string; value: string }[] = [];
    if (record && collection) {
      for (const column of collection.display_columns ?? []) {
        if (details.length === MAX_DETAILS) break;
        const value = formatFieldValue(record[column]).trim();
        if (!value || value === title) continue;
        details.push({ label: snakeCaseToTitleCase(column), value });
      }
    }
    return {
      matchId: m.id,
      collectionSlug: m.collection_slug,
      collectionName: collection?.name ?? m.collection_name ?? m.collection_slug,
      title,
      detailUrl: m.detail_url || `/collection/${m.collection_slug}?record=${encodeURIComponent(m.record_slug ?? m.record_id)}`,
      imagePath: record ? imagePathOf(record) || null : null,
      details,
      missing: !record,
    };
  });
}
