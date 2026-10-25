import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { accessFor, type ViewerAccess } from '@/lib/collections/access';
import { getRecordTitle } from '@/lib/collections/helpers';
import { searchArchive } from '@/lib/collections/search';
import { transcribableKey } from '@/lib/transcription/scans';
import type { Collection } from '@/lib/types';

// Server-only: the assistant's tools read with the service-role client, so
// every tool applies the paywall itself (accessFor) before returning records.

export interface ToolContext {
  admin: SupabaseClient;
  /** The signed-in user's own client, for their bookmarks and activity (RLS). */
  userClient: SupabaseClient;
  userId: string;
  viewer: ViewerAccess;
}

const RESERVED_FIELDS = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'collection_tag', 'ocr_text', 'image_path', 'image_url']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recordUrl = (collectionSlug: string, key: string) => `/collection/${collectionSlug}?record=${encodeURIComponent(key)}`;

/** The published collections, read once per chat turn. */
function collectionsLoader(admin: SupabaseClient) {
  let loaded: Promise<Collection[]> | null = null;
  return () => {
    loaded ??= (async () => {
      const { data } = await admin.from('collections').select('*').eq('is_published', true).order('name');
      return (data ?? []) as Collection[];
    })();
    return loaded;
  };
}

function collectionSummary(c: Collection, byslug: Map<string, Collection>) {
  return {
    slug: c.slug,
    name: c.name,
    short_description: c.short_description,
    category: c.category,
    era: c.era,
    region: c.region,
    parent: c.parent_slug ? byslug.get(c.parent_slug)?.name ?? null : null,
    record_count: c.record_count,
    members_only: c.access_tier !== 'free',
    has_scans: c.has_images,
  };
}

/** A record trimmed for the model: display columns first, then any other filled field. */
function compactRecord(record: Record<string, unknown>, collection: Collection) {
  const out: Record<string, unknown> = {
    id: record.id,
    title: getRecordTitle(record, collection),
    detail_url: recordUrl(collection.slug, String(record.slug ?? record.id ?? '')),
  };
  for (const c of collection.display_columns ?? []) if (record[c] != null && record[c] !== '') out[c] = record[c];
  for (const [k, v] of Object.entries(record)) {
    if (RESERVED_FIELDS.has(k) || k in out || v == null || v === '') continue;
    out[k] = v;
  }
  out.has_scan = Boolean(record.image_path || record.image_url);
  return out;
}

const textMatches = (q: string, ...values: (string | null | undefined)[]) =>
  values.some((v) => v?.toLowerCase().includes(q.toLowerCase()));

interface AssistantTool<S extends z.ZodObject> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext & { collections: () => Promise<Collection[]> }) => Promise<unknown>;
}

const defineTool = <S extends z.ZodObject>(tool: AssistantTool<S>) => tool;

const TOOLS = [
  defineTool({
    name: 'search_archive',
    description:
      'Search records by name, place or keyword. Pass collection_slug to search one collection (preferred when the user names or implies one); leave it out for an archive-wide search. Results come grouped by collection. Members-only collections the user cannot open return only a match count. scanned_pages are hits inside AI transcriptions of scanned pages.',
    schema: z.object({
      query: z.string().min(2).describe('A name, place, keyword or short phrase'),
      collection_slug: z.string().optional().describe('Slug of one collection to search, e.g. "inspection-roll-of-negroes"'),
    }),
    async run({ query, collection_slug }, ctx) {
      const collections = await ctx.collections();
      const byslug = new Map(collections.map((c) => [c.slug, c]));
      const result = await searchArchive({ query, collectionSlug: collection_slug, viewer: ctx.viewer, supabase: ctx.admin });
      const groups = result.records.slice(0, 10).map((g) => {
        const collection = byslug.get(g.collectionSlug);
        if (g.locked) {
          return {
            collection_slug: g.collectionSlug,
            collection_name: g.collectionName,
            parent_name: g.parentName,
            total: g.total,
            members_only: true,
            note: g.locked === 'login' ? 'The user must sign in and become a member to see these.' : 'The user must become a member to see these.',
          };
        }
        return {
          collection_slug: g.collectionSlug,
          collection_name: g.collectionName,
          parent_name: g.parentName,
          total: g.total,
          records: g.records.slice(0, 5).map((r) => ({
            title: collection ? getRecordTitle(r.displayFields, collection) || r.matchValue : r.matchValue,
            detail_url: recordUrl(g.collectionSlug, r.slug ?? r.id),
            match_field: r.matchField,
            match_value: r.matchValue.length > 200 ? `${r.matchValue.slice(0, 197)}…` : r.matchValue,
            ...r.displayFields,
          })),
          scanned_pages: (g.pageMatches ?? []).map((p) => ({
            snippet: p.snippet,
            detail_url: recordUrl(g.collectionSlug, p.recordSlug ?? p.recordId),
            records_on_page: p.records,
          })),
        };
      });
      return {
        query,
        total_groups: result.records.length,
        groups,
        matching_collections: result.collections.slice(0, 8).map((c) => ({ slug: c.slug, name: c.name })),
      };
    },
  }),

  defineTool({
    name: 'search_collections',
    description:
      'Find collections whose name or description mentions a keyword. Use it to resolve a collection the user names into its slug, or to see which collections cover a topic.',
    schema: z.object({ query: z.string().min(2).describe('e.g. "Cherokee", "Virginia", "manumission"') }),
    async run({ query }, ctx) {
      const collections = await ctx.collections();
      const byslug = new Map(collections.map((c) => [c.slug, c]));
      const hits = collections.filter((c) => textMatches(query, c.name, c.short_description, c.long_description));
      return { results: hits.slice(0, 15).map((c) => collectionSummary(c, byslug)) };
    },
  }),

  defineTool({
    name: 'list_collections',
    description:
      'List collections, optionally filtered by category, era or region, or only top-level ones. Use it when the user wants to browse ("what census records do you have", "everything about Virginia").',
    schema: z.object({
      category: z.string().optional().describe('census, church-records, military, slave-trade, legal, immigration, property'),
      era: z.string().optional().describe('colonial, revolutionary, antebellum, civil-war, reconstruction'),
      region: z.string().optional().describe('national, international, georgia, virginia, kentucky, alabama, southeast'),
      top_level_only: z.boolean().optional(),
      query: z.string().optional().describe('Also match this keyword in the name or description'),
    }),
    async run({ category, era, region, top_level_only, query }, ctx) {
      const collections = await ctx.collections();
      const byslug = new Map(collections.map((c) => [c.slug, c]));
      const hits = collections.filter(
        (c) =>
          (!category || c.category === category) &&
          (!era || c.era === era) &&
          (!region || c.region === region) &&
          (!top_level_only || !c.parent_slug) &&
          (!query || textMatches(query, c.name, c.short_description)),
      );
      return { total: hits.length, results: hits.slice(0, 50).map((c) => collectionSummary(c, byslug)) };
    },
  }),

  defineTool({
    name: 'get_collection_info',
    description: "One collection's full description, era, region, record count, columns and whether it has scans.",
    schema: z.object({ slug: z.string().describe('Collection slug') }),
    async run({ slug }, ctx) {
      const collections = await ctx.collections();
      const byslug = new Map(collections.map((c) => [c.slug, c]));
      const c = byslug.get(slug);
      if (!c) return { error: 'No published collection with that slug' };
      return {
        ...collectionSummary(c, byslug),
        long_description: c.long_description,
        columns: c.display_columns,
        tabs: collections.filter((t) => t.parent_slug === slug).map((t) => ({ slug: t.slug, name: t.name })),
      };
    },
  }),

  defineTool({
    name: 'get_record',
    description:
      "Every field of one record, plus the AI transcription of its scanned page when there is one. Use it when the user wants a record's full detail.",
    schema: z.object({
      collection_slug: z.string(),
      record: z.string().describe("The record's slug or id (from a detail_url or search result)"),
    }),
    async run({ collection_slug, record: key }, ctx) {
      const collection = (await ctx.collections()).find((c) => c.slug === collection_slug);
      if (!collection?.table_name) return { error: 'No collection with records under that slug' };
      const access = accessFor(collection, ctx.viewer);
      if (!access.hasAccess) {
        return { error: 'This record is in a members-only collection.', members_only: true, needs: access.reason === 'login' ? 'sign in and membership' : 'membership' };
      }

      const lookup = async (column: 'slug' | 'id') => {
        let q = ctx.admin.from(collection.table_name!).select('*').eq(column, key);
        if (collection.discriminator_column && collection.discriminator_value) {
          q = q.ilike(collection.discriminator_column, collection.discriminator_value);
        }
        const { data } = await q.limit(1).maybeSingle();
        return data as Record<string, unknown> | null;
      };
      const row = (await lookup('slug')) ?? (UUID.test(key) ? await lookup('id') : null);
      if (!row) return { error: 'Record not found' };

      const out: Record<string, unknown> = { collection: { slug: collection.slug, name: collection.name }, record: compactRecord(row, collection) };
      const scan = transcribableKey(row.image_path ?? row.image_url);
      if (scan) {
        const { data: t } = await ctx.admin.from('scan_transcriptions').select('text, confidence').eq('image_key', scan).maybeSingle();
        if (t?.text) {
          const text = String(t.text);
          out.page_transcription = { text: text.length > 4000 ? `${text.slice(0, 4000)}…` : text, confidence: t.confidence, note: 'AI transcription of the scanned page; may contain errors' };
        }
      }
      return out;
    },
  }),

  defineTool({
    name: 'get_related_records',
    description:
      'Records the archive links to this one (family across collections, enslaver and enslaved, ship and passenger). Use after get_record when the user wants to follow a thread.',
    schema: z.object({ record_id: z.string().describe('The record\'s uuid "id"') }),
    async run({ record_id }, ctx) {
      if (!UUID.test(record_id)) return { error: 'record_id must be the record’s uuid id', results: [] };
      const { data, error } = await ctx.admin
        .from('related_records')
        .select('source_record_id, source_name, source_collection, source_collection_slug, target_record_id, target_name, target_collection, target_collection_slug, relationship_type, relationship_note, display_priority')
        .or(`source_record_id.eq.${record_id},target_record_id.eq.${record_id}`)
        .order('display_priority')
        .limit(25);
      if (error) return { error: error.message, results: [] };
      const byslug = new Map((await ctx.collections()).map((c) => [c.slug, c]));
      return {
        results: (data ?? []).map((r) => {
          const fromSource = r.source_record_id === record_id;
          const slug = (fromSource ? r.target_collection_slug : r.source_collection_slug) as string | null;
          const other = byslug.get(slug ?? '');
          const open = other ? accessFor(other, ctx.viewer).hasAccess : false;
          const id = String(fromSource ? r.target_record_id : r.source_record_id);
          return {
            collection_name: fromSource ? r.target_collection : r.source_collection,
            relationship: r.relationship_type,
            note: open ? r.relationship_note : null,
            // Names in members-only collections stay behind the paywall.
            name: open ? (fromSource ? r.target_name : r.source_name) : null,
            members_only: !open,
            detail_url: open && slug ? recordUrl(slug, id) : null,
          };
        }),
      };
    },
  }),

  defineTool({
    name: 'list_my_bookmarks',
    description: "The records this user has bookmarked. Use for questions about their saved research or for recommendations.",
    schema: z.object({}),
    async run(_input, ctx) {
      const { data, error } = await ctx.userClient
        .from('bookmarks')
        .select('page_id, collection_slug, collection_name, record_title, created_at')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) return { error: error.message, results: [] };
      return {
        results: (data ?? []).map((b) => ({
          title: b.record_title,
          collection_name: b.collection_name,
          saved: b.created_at,
          detail_url: b.collection_slug && b.page_id ? recordUrl(String(b.collection_slug), String(b.page_id)) : null,
        })),
      };
    },
  }),

  defineTool({
    name: 'list_my_recent_activity',
    description:
      'Collections, records and searches this user looked at recently. Use with list_my_bookmarks to suggest what to research next.',
    schema: z.object({ limit: z.number().int().min(1).max(40).optional() }),
    async run({ limit }, ctx) {
      const { data, error } = await ctx.userClient
        .from('user_activity')
        .select('type, target_slug, target_name, collection_slug, occurred_at')
        .eq('user_id', ctx.userId)
        .order('occurred_at', { ascending: false })
        .limit(limit ?? 20);
      if (error) return { results: [], unavailable: true };
      return { results: data ?? [] };
    },
  }),
];

/** The tool definitions as the Messages API takes them. */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = TOOLS.map((t) => {
  const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
  delete schema.$schema;
  return { name: t.name, description: t.description, input_schema: schema as Anthropic.Tool.InputSchema };
});

/** Runs one tool call. Bad input or a failure comes back as an error result for Claude, never a thrown error. */
export async function runAssistantTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
  collections = collectionsLoader(ctx.admin),
): Promise<{ output: unknown; error: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { output: { error: `Unknown tool ${name}` }, error: true };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { output: { error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}` }, error: true };
  try {
    // Each tool's input type matches its own schema; TOOLS is a mixed list.
    const output = await (tool.run as (i: unknown, c: unknown) => Promise<unknown>)(parsed.data, { ...ctx, collections });
    const failed = !!output && typeof output === 'object' && 'error' in output;
    return { output, error: failed };
  } catch (err) {
    console.error(`[assistant] tool ${name} failed`, err);
    return { output: { error: 'That lookup failed. Try again or rephrase.' }, error: true };
  }
}

export { collectionsLoader };
