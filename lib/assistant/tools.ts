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
  // detail_url opens the record's modal on top of the collection's page —
  // the page mounts BookmarkRecordOpener which watches ?record=<slug-or-id>
  // and shows the RecordModal. Keeps the user's research context visible.
  const recordKey = record.slug ?? record.id;
  const out: Record<string, unknown> = {
    id: record.id,
    slug: record.slug,
    collection_slug: collection.slug,
    detail_url: recordKey
      ? `/collection/${collection.slug}?record=${encodeURIComponent(String(recordKey))}`
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
 * access-tier check honors their profile. `origin` is used to call sibling
 * Route Handlers (e.g. the global search endpoint).
 */
export function buildAssistantTools(
  supabase: SupabaseClient,
  user: User,
  origin: string,
) {
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

        // ILIKE only works on text columns — running it on integers/dates
        // throws "operator does not exist: <type> ~~* unknown". Ask Postgres
        // which columns are text and intersect with the configured search
        // and display columns before building the filter.
        let textColumns: string[] | null = null;
        try {
          const { data: colData } = await supabase.rpc('get_text_columns', {
            p_table_name: collection.table_name,
          });
          if (colData) {
            textColumns = (colData as { column_name: string }[]).map(
              (c) => c.column_name,
            );
          }
        } catch {
          // RPC may not exist — fall back to configured cols and hope they're text.
        }

        const configuredCols = [
          ...new Set([
            ...(collection.search_columns ?? []),
            ...(collection.display_columns ?? []),
          ]),
        ].filter((c) => !RESERVED_RECORD_FIELDS.has(c));
        const searchCols = textColumns
          ? configuredCols.filter((c) => textColumns!.includes(c))
          : configuredCols;
        if (searchCols.length === 0) {
          return {
            error:
              'No searchable text columns available for this collection — try get_record by id instead.',
          };
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

    get_related_records: tool({
      description:
        'List records that are explicitly related to a given record (the archive curates relationships — e.g. family members across collections, enslaver-and-enslaved pairs, vessel/passenger links). Use after get_record when the user asks "who else is connected to this person?" or wants to follow a thread.',
      inputSchema: z.object({
        record_id: z
          .string()
          .describe('UUID of the record (the `id` field) to find related records for'),
      }),
      execute: async ({ record_id }) => {
        const { data: rels, error } = await supabase
          .from('related_records')
          .select(
            'source_record_id, source_table, source_name, source_collection, source_collection_slug, target_record_id, target_table, target_name, target_collection, target_collection_slug, relationship_type, relationship_note, display_priority',
          )
          .or(
            `source_record_id.eq.${record_id},target_record_id.eq.${record_id}`,
          )
          .order('display_priority')
          .limit(25);
        if (error) return { error: error.message, results: [] };
        const results = (rels ?? []).map((r) => {
          const isSource = r.source_record_id === record_id;
          const other = isSource
            ? {
                id: r.target_record_id,
                collection_slug: r.target_collection_slug,
                collection_name: r.target_collection,
                name: r.target_name,
              }
            : {
                id: r.source_record_id,
                collection_slug: r.source_collection_slug,
                collection_name: r.source_collection,
                name: r.source_name,
              };
          return {
            related_id: other.id,
            related_name: other.name,
            related_collection_slug: other.collection_slug,
            related_collection_name: other.collection_name,
            relationship_type: r.relationship_type,
            relationship_note: r.relationship_note,
            detail_url: other.collection_slug && other.id
              ? `/collection/${other.collection_slug}?record=${encodeURIComponent(other.id)}`
              : null,
          };
        });
        return { results };
      },
    }),

    search_records_globally: tool({
      description:
        'Search records by keyword using the archive\'s token-based matching. Pass `collection_slug` to scope to ONE collection — PREFERRED when the user names or implies a collection (e.g. "in inspection rolls", "in the Henderson Roll"). Omit `collection_slug` for a true cross-archive search ("is there anyone named X anywhere"). Returns matches grouped by collection.',
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .describe('A name, place, keyword, or short phrase to look for'),
        collection_slug: z
          .string()
          .optional()
          .describe(
            'Slug of a single collection to scope the search to (e.g. "inspection-roll-of-negroes"). Use whenever the user named/implied a collection. Leave undefined only for a true archive-wide search.',
          ),
      }),
      execute: async ({ query, collection_slug }) => {
        try {
          const params = new URLSearchParams({ q: query });
          if (collection_slug) params.set('collection', collection_slug);
          const res = await fetch(
            `${origin}/api/collection-search?${params}`,
          );
          if (!res.ok) {
            return { error: `Search failed (${res.status})`, groups: [] };
          }
          const data = (await res.json()) as {
            collections?: Array<{ slug: string; name: string; shortDescription?: string | null }>;
            subcollections?: Array<{ slug: string; name: string; parentName?: string }>;
            records?: Array<{
              collectionSlug: string;
              collectionName: string;
              parentName: string | null;
              total: number;
              records: Array<{
                id: string;
                slug?: string;
                title?: string;
                matchField: string;
                matchValue: string;
                displayFields: Record<string, string>;
              }>;
            }>;
          };
          // Compact for the model — limit each collection's record sample.
          const groups = (data.records ?? []).map((g) => ({
            collection_slug: g.collectionSlug,
            collection_name: g.collectionName,
            parent_name: g.parentName,
            total: g.total,
            records: g.records.slice(0, 5).map((r) => ({
              id: r.id,
              slug: r.slug ?? null,
              // Canonical record title from the archive's name resolution —
              // never blank even if the display columns are awkwardly ordered.
              title: r.title ?? r.slug ?? r.id,
              detail_url: `/collection/${g.collectionSlug}?record=${encodeURIComponent(r.slug ?? r.id)}`,
              match_field: r.matchField,
              match_value: r.matchValue,
              ...r.displayFields,
            })),
          }));
          return {
            query,
            groups,
            collection_matches: data.collections ?? [],
            subcollection_matches: data.subcollections ?? [],
            total_groups: groups.length,
            total_records: groups.reduce((acc, g) => acc + g.total, 0),
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : 'Search failed',
            groups: [],
          };
        }
      },
    }),

    list_collections: tool({
      description:
        'List collections in the archive, optionally filtered by category, era, region, or restricted to top-level (parent) collections. Use for "what census collections do you have", "what\'s in the antebellum era", "list everything about Virginia" — any time the user wants a directory rather than a search.',
      inputSchema: z.object({
        category: z
          .string()
          .optional()
          .describe(
            'One of: census, church-records, military, slave-trade, legal, immigration, property',
          ),
        era: z
          .string()
          .optional()
          .describe(
            'One of: colonial, revolutionary, antebellum, civil-war, reconstruction',
          ),
        region: z
          .string()
          .optional()
          .describe(
            'One of: national, international, georgia, virginia, kentucky, alabama, southeast',
          ),
        top_level_only: z
          .boolean()
          .optional()
          .describe(
            'If true, return only parent collections (no subcollections)',
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Optional keyword to also match against the collection name or description',
          ),
      }),
      execute: async ({ category, era, region, top_level_only, query }) => {
        let q = supabase
          .from('collections')
          .select(
            'slug, name, short_description, category, era, region, parent_slug, record_count, has_images',
          )
          .eq('is_published', true)
          .order('name');
        if (category) q = q.eq('category', category);
        if (era) q = q.eq('era', era);
        if (region) q = q.eq('region', region);
        if (top_level_only) q = q.is('parent_slug', null);
        if (query) {
          const safe = query.replace(/[,%]/g, '');
          q = q.or(`name.ilike.%${safe}%,short_description.ilike.%${safe}%`);
        }
        const { data, error } = await q.limit(50);
        if (error) return { error: error.message, results: [] };
        return { results: data ?? [] };
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

    list_my_recent_activity: tool({
      description:
        'List the records, collections, and searches the current user has recently engaged with on the site. Use alongside list_my_bookmarks to understand the user\'s active research interests and suggest follow-up directions (e.g. unvisited subcollections in collections they keep returning to, related records they haven\'t opened yet).',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(40)
          .optional()
          .describe('How many items to return (default 20)'),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from('user_activity')
          .select(
            'type, target_slug, target_name, collection_slug, parent_slug, occurred_at',
          )
          .eq('user_id', user.id)
          .order('occurred_at', { ascending: false })
          .limit(limit ?? 20);
        if (error) {
          // user_activity table may not be deployed yet — degrade gracefully.
          if (error.code === '42P01') return { results: [], unavailable: true };
          return { error: error.message, results: [] };
        }
        return { results: data ?? [] };
      },
    }),
  };
}
