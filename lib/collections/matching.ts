import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

// Reuse nameFields from helpers.ts concept
const NAME_FIELDS = [
  'name', 'soldier_name', 'head_of_family', 'principal_name', 'full_name',
  'person_name', 'child', 'recipient_name', 'enslaver', 'enslaved_person',
  'by_whom_enslaved', 'enslaver_family', 'to_whom_sold',
];

const LOCATION_FIELDS = [
  'county', 'state', 'city', 'location', 'parish', 'district', 'region',
  'residence', 'place', 'place_of_birth', 'birth_place', 'port',
];

const DATE_FIELDS = [
  'year', 'date', 'enlistment_date', 'date_of_sale', 'date_of_record',
];

export interface MatchValues {
  nameTokens: string[];
  locations: string[];
  dates: string[];
}

export interface MatchingConfig {
  maxCandidateCollections: number;
  maxResultsPerCollection: number;
  maxTotalAlgorithmic: number;
}

export function getDefaultConfig(): MatchingConfig {
  return {
    maxCandidateCollections: 5,
    maxResultsPerCollection: 3,
    maxTotalAlgorithmic: 5,
  };
}

// Common name suffixes/prefixes that aren't useful for matching on their own.
// "Sr/Jr/II/III" tend to dilute results when used as standalone tokens.
const NAME_STOP_TOKENS = new Set(['jr', 'sr', 'i', 'ii', 'iii', 'iv', 'v', 'mr', 'mrs', 'ms', 'dr', 'esqr', 'esq']);

function tokenizeName(s: string): string[] {
  return s
    .trim()
    // Split on whitespace and common punctuation so "Smith, John P." -> ["Smith", "John", "P"].
    .split(/[\s,.;()/\\-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((t) => t.length > 1 && !NAME_STOP_TOKENS.has(t.toLowerCase()));
}

export function extractMatchValues(
  record: CollectionRecord,
  collection: Collection
): MatchValues {
  const nameTokens: string[] = [];
  const locations: string[] = [];
  const dates: string[] = [];

  // Extract name tokens from every known name field; previously this was capped
  // and tokens shorter than 3 chars were dropped, which silently hid valid
  // surnames (e.g. "Wu", "Ng") and trimmed multi-part names down to first names.
  for (const field of NAME_FIELDS) {
    const val = record[field];
    if (val && typeof val === 'string' && val.trim()) {
      nameTokens.push(...tokenizeName(val));
    }
  }

  // Also check display columns for names if we still have nothing.
  if (nameTokens.length === 0 && collection.display_columns?.length) {
    const val = record[collection.display_columns[0]];
    if (val && typeof val === 'string' && val.trim()) {
      nameTokens.push(...tokenizeName(val));
    }
  }

  // Extract locations
  for (const field of LOCATION_FIELDS) {
    const val = record[field];
    if (val && typeof val === 'string' && val.trim()) {
      locations.push(val.trim());
    }
  }

  // Extract dates
  for (const field of DATE_FIELDS) {
    const val = record[field];
    if (val !== null && val !== undefined && String(val).trim()) {
      dates.push(String(val).trim());
    }
  }

  return {
    nameTokens: [...new Set(nameTokens.map((t) => t.toLowerCase()))],
    locations: [...new Set(locations)].slice(0, 3),
    dates: [...new Set(dates)].slice(0, 2),
  };
}

export async function findCandidateCollections(
  supabase: SupabaseClient,
  sourceCollection: Collection,
  config: MatchingConfig
): Promise<Collection[]> {
  // Find published collections sharing category, era, or region — exclude source
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_published', true)
    .neq('slug', sourceCollection.slug)
    .not('table_name', 'is', null);

  if (error || !data) return [];

  const candidates = (data as Collection[])
    .map((c) => {
      let score = 0;
      if (c.category === sourceCollection.category) score += 3;
      if (c.era && c.era === sourceCollection.era) score += 2;
      if (c.region && c.region === sourceCollection.region) score += 2;
      // Prefer collections with search columns
      if (c.search_columns?.length > 0) score += 1;
      return { collection: c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxCandidateCollections);

  return candidates.map((c) => c.collection);
}

export interface ScoredResult {
  id: string;
  slug: string;
  name: string;
  collectionSlug: string;
  collectionName: string;
  tableName: string;
  matchReasons: string[];
  score: number;
}

export async function searchCandidateCollection(
  supabase: SupabaseClient,
  candidate: Collection,
  matchValues: MatchValues,
  maxResults: number
): Promise<ScoredResult[]> {
  if (!candidate.table_name) return [];

  const searchCols = candidate.search_columns?.length
    ? candidate.search_columns
    : candidate.display_columns?.slice(0, 3) || [];

  if (searchCols.length === 0) return [];

  // Build OR filter from every name token and a couple of locations. Using
  // every token (not just the first 3) means a record with a matching last
  // name in a longer source name still surfaces.
  const orParts: string[] = [];
  for (const token of matchValues.nameTokens) {
    for (const col of searchCols) {
      orParts.push(`${col}.ilike.%${token}%`);
    }
  }
  for (const loc of matchValues.locations.slice(0, 2)) {
    for (const col of searchCols) {
      orParts.push(`${col}.ilike.%${loc}%`);
    }
  }

  if (orParts.length === 0) return [];

  const selectCols = [
    'id', 'slug',
    ...new Set([...searchCols, ...(candidate.display_columns || []).slice(0, 3)]),
  ].join(',');

  try {
    let query = supabase
      .from(candidate.table_name)
      .select(selectCols)
      // Pull a generous pool to score from. Scoring then trims to maxResults.
      .or(orParts.join(','))
      .limit(Math.max(maxResults * 6, 50));

    if (candidate.discriminator_column && candidate.discriminator_value) {
      query = query.ilike(candidate.discriminator_column, candidate.discriminator_value);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      const reasons: string[] = [];
      let score = 0;

      // Count distinct name tokens that appeared in any searched column.
      const tokenHits = new Set<string>();
      for (const token of matchValues.nameTokens) {
        for (const col of searchCols) {
          const val = row[col];
          if (val && typeof val === 'string' && val.toLowerCase().includes(token)) {
            tokenHits.add(token);
            break;
          }
        }
      }
      if (tokenHits.size > 0) {
        // 3 points per matched token + 5-point bonus once 2+ tokens match
        // (so a record matching first AND last name is clearly preferred over
        // one that only shares a common first name).
        score += tokenHits.size * 3;
        if (tokenHits.size >= 2) score += 5;
        reasons.push(
          tokenHits.size >= matchValues.nameTokens.length && matchValues.nameTokens.length > 1
            ? 'Full name match'
            : tokenHits.size >= 2
            ? 'Name match'
            : 'Similar name',
        );
      }

      // Location matches
      for (const loc of matchValues.locations) {
        for (const col of searchCols) {
          const val = row[col];
          if (val && typeof val === 'string' && val.toLowerCase().includes(loc.toLowerCase())) {
            reasons.push(`Same ${col.replace(/_/g, ' ')}`);
            score += 2;
            break;
          }
        }
      }

      const name = getRecordTitle(row, candidate);

      return {
        id: row.id,
        slug: row.slug || row.id,
        name,
        collectionSlug: candidate.slug,
        collectionName: candidate.name,
        tableName: candidate.table_name!,
        matchReasons: [...new Set(reasons)],
        score,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
  } catch {
    return [];
  }
}
