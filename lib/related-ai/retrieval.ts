import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

// Cross-column, cross-collection candidate retrieval for AI related-records.
//
// Unlike the legacy lexical matcher (which only searches a collection's
// configured `search_columns` against name fields), this searches the source
// record's salient terms against EVERY text column of EVERY published
// collection. That's what lets a name in one record match the `remarks`,
// notes, or any other field of a record in a different collection. The pool it
// returns is deliberately broad (high recall); the AI judge supplies precision.

// Columns that never carry meaningful match text.
const SKIP_COLUMNS = new Set(['slug', 'image_path']);

// ocr_text (raw scanned-page text) IS searched so a name handwritten in a
// document gets matched — but its full content is never dumped into the judge
// prompt (only a snippet around the match), since these can be huge.
const SNIPPET_COLUMNS = new Set(['ocr_text']);

const STOP_TOKENS = new Set([
  'jr', 'sr', 'i', 'ii', 'iii', 'iv', 'v', 'mr', 'mrs', 'ms', 'dr', 'esq',
  'the', 'of', 'and', 'a', 'an', 'unknown', 'unk', 'illegible', 'illegilbe',
  'negro', 'negroes', 'slave', 'enslaved', 'child', 'infant', 'son', 'daughter',
]);

export interface Candidate {
  table: string;
  collectionSlug: string;
  collectionName: string;
  id: string;
  slug: string;
  title: string;
  // A compact view of the record for the judge (only populated text fields).
  fields: Record<string, string>;
  matchedColumns: string[];
}

export interface RetrievalResult {
  sourceTitle: string;
  terms: string[];
  candidates: Candidate[];
}

function tokenize(value: string): string[] {
  return value
    .split(/[\s,.;:()/\\[\]'"-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t.toLowerCase()));
}

// Pull the distinctive terms worth searching other collections for: the name
// tokens plus any location-like values. Kept small — each term widens the OR.
function extractTerms(record: CollectionRecord, collection: Collection): string[] {
  const terms = new Set<string>();

  const title = getRecordTitle(record, collection);
  for (const t of tokenize(title)) terms.add(t);

  const LOCATION_FIELDS = [
    'county', 'state', 'city', 'parish', 'district', 'residence', 'place',
    'birth_place', 'place_of_birth', 'location', 'region', 'port',
  ];
  for (const f of LOCATION_FIELDS) {
    const v = record[f];
    if (typeof v === 'string' && v.trim()) {
      for (const t of tokenize(v)) terms.add(t);
    }
  }

  return [...terms];
}

// PostgREST OR values can't contain commas/parens unescaped — wrap unsafe
// ILIKE patterns in double quotes.
function ilikeValue(col: string, term: string): string {
  return `${col}.ilike."%${term.replace(/[%"]/g, '')}%"`;
}

const textColumnCache = new Map<string, string[]>();

async function getSearchableColumns(
  supabase: SupabaseClient,
  tableName: string,
): Promise<string[]> {
  const cached = textColumnCache.get(tableName);
  if (cached) return cached;

  const { data } = await supabase.rpc('get_text_columns', { p_table_name: tableName });
  const cols = ((data as { column_name: string }[]) || [])
    .map((c) => c.column_name)
    .filter((c) => !SKIP_COLUMNS.has(c));
  textColumnCache.set(tableName, cols);
  return cols;
}

interface RetrievalOptions {
  perCollection?: number;
  maxCandidates?: number;
  maxTerms?: number;
}

export async function retrieveCandidates(
  supabase: SupabaseClient,
  sourceCollection: Collection,
  sourceRecord: CollectionRecord,
  opts: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const { perCollection = 6, maxCandidates = 60, maxTerms = 6 } = opts;

  const sourceTitle = getRecordTitle(sourceRecord, sourceCollection);
  const terms = extractTerms(sourceRecord, sourceCollection).slice(0, maxTerms);

  if (terms.length === 0) {
    return { sourceTitle, terms: [], candidates: [] };
  }

  const { data: collectionsRaw } = await supabase
    .from('collections')
    .select('*')
    .eq('is_published', true)
    .not('table_name', 'is', null);

  const collections = (collectionsRaw as Collection[]) || [];

  const perCollectionResults = await Promise.all(
    collections.map(async (c) => {
      if (!c.table_name) return [];
      try {
        const cols = await getSearchableColumns(supabase, c.table_name);
        if (cols.length === 0) return [];

        const orParts: string[] = [];
        for (const term of terms) {
          for (const col of cols) orParts.push(ilikeValue(col, term));
        }
        if (orParts.length === 0) return [];

        let query = supabase
          .from(c.table_name)
          .select('*')
          .or(orParts.join(','))
          .limit(perCollection);
        if (c.discriminator_column && c.discriminator_value) {
          query = query.ilike(c.discriminator_column, c.discriminator_value);
        }

        const { data, error } = await query;
        if (error || !data) return [];

        return (data as CollectionRecord[]).map((row): Candidate => {
          // Compact field view: which columns actually contain a search term,
          // plus a few populated text fields for context.
          const matchedColumns: string[] = [];
          const fields: Record<string, string> = {};
          for (const col of cols) {
            const val = row[col];
            if (typeof val !== 'string' || !val.trim()) continue;
            const lower = val.toLowerCase();
            const matchedTerm = terms.find((t) => lower.includes(t.toLowerCase()));
            if (matchedTerm) matchedColumns.push(col);

            if (SNIPPET_COLUMNS.has(col)) {
              // Only surface a window around the match for huge text dumps.
              if (matchedTerm) {
                const idx = lower.indexOf(matchedTerm.toLowerCase());
                const start = Math.max(0, idx - 80);
                const snippet = val.slice(start, idx + matchedTerm.length + 120).trim();
                fields[col] = `${start > 0 ? '…' : ''}${snippet}…`;
              }
              continue;
            }
            if (Object.keys(fields).length < 8) fields[col] = val.slice(0, 240);
          }
          return {
            table: c.table_name!,
            collectionSlug: c.slug,
            collectionName: c.name,
            id: String(row.id),
            slug: (row.slug as string) || String(row.id),
            title: getRecordTitle(row, c),
            fields,
            matchedColumns,
          };
        });
      } catch {
        return [];
      }
    }),
  );

  // Flatten, drop the source record itself, dedupe by id, prefer richer hits
  // (more matched columns) when capping.
  const seen = new Set<string>([String(sourceRecord.id)]);
  const candidates: Candidate[] = [];
  for (const c of perCollectionResults.flat().sort((a, b) => b.matchedColumns.length - a.matchedColumns.length)) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    candidates.push(c);
    if (candidates.length >= maxCandidates) break;
  }

  return { sourceTitle, terms, candidates };
}
