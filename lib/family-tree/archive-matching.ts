import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection, TreeIndividual, ArchiveMatch } from '@/lib/types';
import {
  searchCandidateCollection,
  type MatchValues,
} from '@/lib/collections/matching';

const NAME_STOP_TOKENS = new Set([
  'jr', 'sr', 'i', 'ii', 'iii', 'iv', 'v', 'mr', 'mrs', 'ms', 'dr',
  'unknown', 'unk', 'infant', 'son', 'daughter', 'of',
]);

function tokenizeName(...parts: (string | null | undefined)[]): string[] {
  const tokens = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(' ')
    .split(/[\s,.;()/\\-]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase())
    .filter((t) => t.length > 1 && !NAME_STOP_TOKENS.has(t));
  return [...new Set(tokens)];
}

interface FindOptions {
  maxCollections?: number;
  perCollection?: number;
  limit?: number;
}

/**
 * Find archive records that plausibly refer to the same person as a tree
 * individual. Reuses the scored cross-collection search engine from
 * lib/collections/matching.ts, scoped across every published collection.
 */
export async function findArchiveMatches(
  supabase: SupabaseClient,
  person: Pick<
    TreeIndividual,
    'given_name' | 'surname' | 'birth_place' | 'death_place' | 'birth_date' | 'death_date'
  >,
  opts: FindOptions = {}
): Promise<ArchiveMatch[]> {
  const { maxCollections = 30, perCollection = 3, limit = 12 } = opts;

  const nameTokens = tokenizeName(person.given_name, person.surname);
  // Without at least one usable name token there is nothing to match on.
  if (nameTokens.length === 0) return [];

  const locations = [...new Set(
    [person.birth_place, person.death_place]
      .filter((l): l is string => Boolean(l && l.trim()))
      .map((l) => l.trim())
  )].slice(0, 2);

  const dates = [...new Set(
    [person.birth_date, person.death_date]
      .filter((d): d is string => Boolean(d && String(d).trim()))
      .map((d) => String(d).trim())
  )].slice(0, 2);

  const matchValues: MatchValues = { nameTokens, locations, dates };

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_published', true)
    .not('table_name', 'is', null);

  if (error || !data) return [];

  // Prefer collections that actually declare searchable columns.
  const collections = (data as Collection[])
    .filter((c) => c.table_name)
    .sort(
      (a, b) =>
        (b.search_columns?.length || 0) - (a.search_columns?.length || 0)
    )
    .slice(0, maxCollections);

  const perCollectionResults = await Promise.all(
    collections.map((c) =>
      searchCandidateCollection(supabase, c, matchValues, perCollection).catch(
        () => []
      )
    )
  );

  return perCollectionResults
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      slug: r.slug || r.id,
      title: r.name,
      collectionSlug: r.collectionSlug,
      collectionName: r.collectionName,
      matchReasons: r.matchReasons,
      score: r.score,
      detailUrl: `/collection/${r.collectionSlug}?record=${encodeURIComponent(
        r.slug || r.id
      )}`,
    }));
}
