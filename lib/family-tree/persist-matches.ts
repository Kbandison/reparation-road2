import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveMatch, TreeIndividual } from '@/lib/types';
import { findArchiveMatches } from './archive-matching';

// Run archive matching for one individual and persist the results.
//
// Uses an admin (service-role) client so it can search arbitrary collection
// tables and write match rows regardless of RLS. Replaces the person's previous
// *suggested* matches while leaving any 'linked' or 'dismissed' rows intact, and
// stamps `matched_at` so batch runs skip this person next time.
export async function matchAndPersist(
  admin: SupabaseClient,
  person: TreeIndividual,
): Promise<ArchiveMatch[]> {
  let matches: ArchiveMatch[] = [];
  try {
    matches = await findArchiveMatches(admin, person);
  } catch {
    matches = [];
  }

  // Clear stale suggestions; keep confirmed links and dismissals.
  await admin
    .from('tree_individual_matches')
    .delete()
    .eq('individual_id', person.id)
    .eq('status', 'suggested');

  if (matches.length > 0) {
    const rows = matches.map((m) => ({
      individual_id: person.id,
      tree_id: person.tree_id,
      user_id: person.user_id,
      collection_slug: m.collectionSlug,
      collection_name: m.collectionName,
      record_id: m.id,
      record_slug: m.slug,
      title: m.title,
      score: m.score,
      match_reasons: m.matchReasons,
      detail_url: m.detailUrl,
      status: 'suggested',
    }));
    // Ignore conflicts so a record already linked/dismissed for this person
    // doesn't get resurrected as a fresh suggestion.
    await admin
      .from('tree_individual_matches')
      .upsert(rows, { onConflict: 'individual_id,collection_slug,record_id', ignoreDuplicates: true });
  }

  await admin
    .from('tree_individuals')
    .update({ matched_at: new Date().toISOString() })
    .eq('id', person.id);

  return matches;
}

// Run a set of individuals through matching with a small concurrency cap so a
// batch doesn't overwhelm the database or the function's time budget.
export async function matchBatch(
  admin: SupabaseClient,
  people: TreeIndividual[],
  concurrency = 4,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < people.length) {
      const person = people[cursor++];
      await matchAndPersist(admin, person);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, people.length) }, worker));
}
