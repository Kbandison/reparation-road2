import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

/**
 * Citations and source information.
 *
 * A collection can set a citation template and a source (archival provenance).
 * A tab that leaves either blank falls back to its folder, then that folder's
 * folder, so one folder can cover every tab inside it. The two fields fall back
 * independently. A per-record override (record_citations) beats all of them.
 */

/** The columns the fallback chain reads from each collection. */
export type CitationLink = Pick<
  Collection,
  'slug' | 'name' | 'parent_slug' | 'citation_template' | 'source_information'
>;

const CITATION_LINK_COLUMNS = 'slug, name, parent_slug, citation_template, source_information';

// Folders nest two or three deep; the cap only guards against a parent_slug cycle.
const MAX_DEPTH = 10;

export interface InheritedValue {
  value: string;
  /** The collection or folder that set it. */
  from: Pick<Collection, 'slug' | 'name'>;
}

export interface CitationDefaults {
  citationTemplate: InheritedValue | null;
  sourceInformation: InheritedValue | null;
}

/** Trimmed text, or null when blank. Columns can also be undefined on partial rows. */
export function cleanCitationText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The first non-blank value of each field, nearest collection first. */
export function resolveCitationDefaults(chain: CitationLink[]): CitationDefaults {
  const pick = (field: 'citation_template' | 'source_information'): InheritedValue | null => {
    for (const link of chain) {
      const value = cleanCitationText(link[field]);
      if (value) return { value, from: { slug: link.slug, name: link.name } };
    }
    return null;
  };
  return {
    citationTemplate: pick('citation_template'),
    sourceInformation: pick('source_information'),
  };
}

/** A collection and its parent folders, nearest first, from rows already loaded. */
export function citationChainFromList(slug: string | null, all: CitationLink[]): CitationLink[] {
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  const chain: CitationLink[] = [];
  let next = slug;
  while (next && chain.length < MAX_DEPTH) {
    const link = bySlug.get(next);
    if (!link || chain.includes(link)) break;
    chain.push(link);
    next = link.parent_slug;
  }
  return chain;
}

/**
 * A collection and its parent folders, nearest first, read from the database.
 * Reads the collection itself too, because some callers hold a partial row
 * without the citation columns. Returns what it got so far on an error.
 */
export async function fetchCitationChain(supabase: SupabaseClient, slug: string): Promise<CitationLink[]> {
  const chain: CitationLink[] = [];
  const seen = new Set<string>();
  let next: string | null = slug;
  while (next && chain.length < MAX_DEPTH && !seen.has(next)) {
    seen.add(next);
    const { data, error } = await supabase
      .from('collections')
      .select(CITATION_LINK_COLUMNS)
      .eq('slug', next)
      .maybeSingle();
    if (error) {
      console.error('[citation] failed to read the collection chain:', error.message);
      break;
    }
    if (!data) break;
    const link = data as CitationLink;
    chain.push(link);
    next = link.parent_slug;
  }
  return chain;
}

/**
 * The source to show for a collection: its own, else the nearest parent
 * folder's. Only reads the database when the collection leaves it blank.
 */
export async function getCollectionSource(
  supabase: SupabaseClient,
  collection: Pick<Collection, 'source_information' | 'parent_slug'>,
): Promise<string | null> {
  const own = cleanCitationText(collection.source_information);
  if (own || !collection.parent_slug) return own;
  const parents = await fetchCitationChain(supabase, collection.parent_slug);
  return resolveCitationDefaults(parents).sourceInformation?.value ?? null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const CITATION_PLACEHOLDERS = [
  { key: '{{record_title}}', desc: 'Record display name' },
  { key: '{{collection_name}}', desc: 'Collection name' },
  { key: '{{record_id}}', desc: 'Record slug or ID' },
  { key: '{{collection_slug}}', desc: 'Collection slug' },
  { key: '{{accessed_date}}', desc: 'Current date' },
  { key: '{{url}}', desc: 'Full record URL' },
] as const;

/** Chicago/Turabian style, used when no collection or folder sets a template. */
export const DEFAULT_CITATION_TEMPLATE =
  '"{{record_title}}," {{collection_name}}, Reparation Road Digital Archive, {{url}}, accessed {{accessed_date}}.';

export interface CitationValues {
  recordTitle: string;
  recordId: string;
  collectionName: string;
  collectionSlug: string;
}

export function fillCitationTemplate(template: string, values: CitationValues): string {
  const url = `reparationroad.org/collection/${values.collectionSlug}/${values.recordId}`;
  const accessedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return template
    .replace(/\{\{record_title\}\}/g, values.recordTitle)
    .replace(/\{\{collection_name\}\}/g, values.collectionName)
    .replace(/\{\{record_id\}\}/g, values.recordId)
    .replace(/\{\{collection_slug\}\}/g, values.collectionSlug)
    .replace(/\{\{accessed_date\}\}/g, accessedDate)
    .replace(/\{\{url\}\}/g, url);
}

/**
 * The citation shown on a record: its own override, else the nearest template
 * (collection, then folders), else the default. The record's own collection
 * always fills {{collection_name}}, even when the template came from a folder.
 */
export function buildRecordCitation(
  collection: Pick<Collection, 'slug' | 'name' | 'display_columns'>,
  record: CollectionRecord,
  template: string | null,
  override: string | null,
): string {
  const custom = cleanCitationText(override);
  if (custom) return custom;
  return fillCitationTemplate(template || DEFAULT_CITATION_TEMPLATE, {
    recordTitle: getRecordTitle(record, collection.display_columns || []),
    recordId: record.slug || record.id,
    collectionName: collection.name,
    collectionSlug: collection.slug,
  });
}
