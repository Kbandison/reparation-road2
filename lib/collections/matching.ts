import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, CollectionRecord } from '@/lib/types';

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

export function extractMatchValues(
  record: CollectionRecord,
  collection: Collection
): MatchValues {
  const nameTokens: string[] = [];
  const locations: string[] = [];
  const dates: string[] = [];

  // Extract name tokens
  for (const field of NAME_FIELDS) {
    const val = record[field];
    if (val && typeof val === 'string' && val.trim()) {
      // Split compound names into tokens (e.g. "John Smith" -> ["John", "Smith"])
      const tokens = val.trim().split(/\s+/).filter((t) => t.length > 2);
      nameTokens.push(...tokens);
    }
  }

  // Also check display columns for names
  if (nameTokens.length === 0 && collection.display_columns?.length) {
    const val = record[collection.display_columns[0]];
    if (val && typeof val === 'string' && val.trim()) {
      const tokens = val.trim().split(/\s+/).filter((t) => t.length > 2);
      nameTokens.push(...tokens);
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
    nameTokens: [...new Set(nameTokens)].slice(0, 5),
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

  // Build OR filter from name tokens and locations
  const orParts: string[] = [];

  for (const token of matchValues.nameTokens.slice(0, 3)) {
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
      .or(orParts.join(','))
      .limit(maxResults * 2);

    if (candidate.discriminator_column && candidate.discriminator_value) {
      query = query.eq(candidate.discriminator_column, candidate.discriminator_value);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Score and format results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      const reasons: string[] = [];
      let score = 0;

      // Check name matches
      for (const token of matchValues.nameTokens) {
        for (const col of searchCols) {
          const val = row[col];
          if (val && typeof val === 'string' && val.toLowerCase().includes(token.toLowerCase())) {
            reasons.push(`Similar name`);
            score += 3;
            break;
          }
        }
        if (reasons.includes('Similar name')) break;
      }

      // Check location matches
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

      // Determine display name
      let name = '';
      for (const col of candidate.display_columns || searchCols) {
        if (row[col] && typeof row[col] === 'string') {
          name = row[col];
          break;
        }
      }

      return {
        id: row.id,
        slug: row.slug || row.id,
        name: name || row.id,
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
