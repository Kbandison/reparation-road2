import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { checkCollectionAccess } from '@/lib/collections/access';
import type { Collection } from '@/lib/types';

const RESERVED_RECORD_FIELDS = new Set([
  'id',
  'slug',
  'created_at',
  'updated_at',
  'embedding',
  'tsv',
  'collection_tag',
  'ocr_text',
]);

function compactRecord(
  record: Record<string, unknown>,
  collection: Pick<Collection, 'display_columns' | 'slug' | 'has_images'>,
) {
  const out: Record<string, unknown> = {
    id: record.id,
    slug: record.slug,
    collection_slug: collection.slug,
    detail_url: record.slug
      ? `/collection/${collection.slug}/${record.slug}`
      : `/collection/${collection.slug}`,
  };
  // Keep display columns first (most informative), then any other non-reserved fields.
  const cols = collection.display_columns ?? [];
  for (const c of cols) {
    if (record[c] != null && record[c] !== '') out[c] = record[c];
  }
  for (const [k, v] of Object.entries(record)) {
    if (RESERVED_RECORD_FIELDS.has(k)) continue;
    if (k in out) continue;
    if (v == null || v === '') continue;
    out[k] = v;
  }
  if (collection.has_images && record.image_path) {
    out.image_path = record.image_path;
  }
  return out;
}

/**
 * Builds the assistant's tool set with the user's authenticated supabase
 * client captured in closure — so every query runs as that user and the
 * access-tier check honors their profile.
 */
export function buildAssistantTools(supabase: SupabaseClient, user: User) {
  return {
    search_collections: tool({
      description:
        'Search the archive for collections whose name or description matches a keyword. Use this when the user asks about a topic, era, region, or kind of record and you need to find which collections might be relevant.',
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .describe(
            'Keyword to match against collection name and description, e.g. "Cherokee", "Virginia", "freedmen"',
          ),
      }),
      execute: async ({ query }) => {
        const safe = query.replace(/[,%]/g, '');
        const { data, error } = await supabase
          .from('collections')
          .select(
            'slug, name, short_description, category, era, region, parent_slug, record_count',
          )
          .eq('is_published', true)
          .or(
            `name.ilike.%${safe}%,short_description.ilike.%${safe}%,long_description.ilike.%${safe}%`,
          )
          .order('name')
          .limit(15);
        if (error) return { error: error.message, results: [] };
        return { results: data ?? [] };
      },
    }),

    get_collection_info: tool({
      description:
        'Fetch the metadata for a specific collection by slug — name, descriptions, era, region, what kinds of records it contains, and whether it has images. Use this to explain a collection to the user.',
      inputSchema: z.object({
        slug: z.string().describe('Collection slug, e.g. "cherokee-henderson"'),
      }),
      execute: async ({ slug }) => {
        const { data, error } = await supabase
          .from('collections')
          .select(
            'slug, name, short_description, long_description, category, era, region, parent_slug, record_count, has_images, has_ocr, display_columns, access_tier, is_published',
          )
          .eq('slug', slug)
          .maybeSingle();
        if (error) return { error: error.message };
        if (!data) return { error: 'Collection not found' };
        return data;
      },
    }),

    find_records: tool({
      description:
        'Search for records inside a specific collection. Use after find a collection of interest to actually pull names that match the user\'s query. Returns up to 10 records.',
      inputSchema: z.object({
        collection_slug: z.string().describe('The collection to search inside'),
        query: z
          .string()
          .min(2)
          .describe(
            'Name, place, or keyword to match against the collection\'s searchable text columns',
          ),
      }),
      execute: async ({ collection_slug, query }) => {
        const { data: collectionRow } = await supabase
          .from('collections')
          .select('*')
          .eq('slug', collection_slug)
          .maybeSingle();
        if (!collectionRow) return { error: 'Collection not found' };
        const collection = collectionRow as Collection;
        if (!collection.table_name) {
          return { error: 'Collection has no records yet' };
        }

        const access = await checkCollectionAccess(supabase, collection);
        if (!access.hasAccess) {
          return {
            error:
              access.reason === 'subscribe'
                ? 'This collection requires a premium subscription.'
                : 'Sign-in required for this collection.',
          };
        }

        const searchCols = [
          ...new Set([
            ...(collection.search_columns ?? []),
            ...(collection.display_columns ?? []),
          ]),
        ].filter((c) => !RESERVED_RECORD_FIELDS.has(c));
        if (searchCols.length === 0) {
          return { error: 'No searchable columns configured for this collection' };
        }

        const safe = query.replace(/[,%]/g, '');
        let q = supabase.from(collection.table_name).select('*');
        if (collection.discriminator_column && collection.discriminator_value) {
          q = q.ilike(collection.discriminator_column, collection.discriminator_value);
        }
        q = q.or(searchCols.map((c) => `${c}.ilike.%${safe}%`).join(',')).limit(10);
        const { data: rows, error } = await q;
        if (error) return { error: error.message };
        return {
          collection: {
            slug: collection.slug,
            name: collection.name,
            record_count: collection.record_count,
          },
          results: (rows ?? []).map((r) =>
            compactRecord(r as Record<string, unknown>, collection),
          ),
        };
      },
    }),

    get_record: tool({
      description:
        'Fetch full details for a single record by collection + record slug or id. Use this when the user asks for everything known about a person or item.',
      inputSchema: z.object({
        collection_slug: z.string(),
        record_slug_or_id: z
          .string()
          .describe('The record\'s slug or its uuid id'),
      }),
      execute: async ({ collection_slug, record_slug_or_id }) => {
        const { data: collectionRow } = await supabase
          .from('collections')
          .select('*')
          .eq('slug', collection_slug)
          .maybeSingle();
        if (!collectionRow) return { error: 'Collection not found' };
        const collection = collectionRow as Collection;
        if (!collection.table_name) return { error: 'Collection has no records' };

        const access = await checkCollectionAccess(supabase, collection);
        if (!access.hasAccess) {
          return {
            error:
              access.reason === 'subscribe'
                ? 'This collection requires a premium subscription.'
                : 'Sign-in required for this collection.',
          };
        }

        // Try by slug first, fall back to uuid id
        const { data: bySlug } = await supabase
          .from(collection.table_name)
          .select('*')
          .eq('slug', record_slug_or_id)
          .maybeSingle();
        const record =
          bySlug ??
          (
            await supabase
              .from(collection.table_name)
              .select('*')
              .eq('id', record_slug_or_id)
              .maybeSingle()
          ).data;
        if (!record) return { error: 'Record not found' };
        return {
          collection: { slug: collection.slug, name: collection.name },
          record: compactRecord(record as Record<string, unknown>, collection),
        };
      },
    }),

    list_my_bookmarks: tool({
      description:
        'List the records the current user has bookmarked. Use this when they ask about their saved items, want to revisit research, or want recommendations based on what they\'ve saved.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('bookmarks')
          .select('id, collection_slug, record_id, record_title, notes, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(25);
        if (error) return { error: error.message, results: [] };
        return { results: data ?? [] };
      },
    }),
  };
}
