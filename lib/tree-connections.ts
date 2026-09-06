import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Finding other researchers who have the same people in their trees.
 *
 * Matching is mutual and opt-in: nothing is visible in either direction until
 * both users have turned tree sharing on. See tree_connections_migration.sql —
 * once on, all of a user's individuals are matchable, living relatives
 * included, which is why the opt-in copy says so in as many words.
 */

export type MatchConfidence = 'strong' | 'probable' | 'possible';

interface OverlapRow {
  my_individual_id: string;
  my_tree_id: string;
  given_name: string | null;
  surname: string | null;
  birth_year: number | null;
  birth_place: string | null;
  other_user_id: string;
  other_individual_id: string;
  other_birth_year: number | null;
  other_birth_place: string | null;
  other_handle: string | null;
  other_display_name: string | null;
  other_avatar_url: string | null;
  confidence: MatchConfidence;
  name_frequency: number;
}

export interface SharedPerson {
  individualId: string;
  treeId: string;
  name: string;
  birthYear: number | null;
  birthPlace: string | null;
  theirBirthYear: number | null;
  theirBirthPlace: string | null;
  confidence: MatchConfidence;
  /** How many people across all shared trees carry this name. Low is rare. */
  nameFrequency: number;
}

export interface ResearcherOverlap {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  people: SharedPerson[];
  /** Best confidence across the shared people — what the card leads with. */
  bestConfidence: MatchConfidence;
  /** Rarest name shared with this researcher; drives ordering between cards. */
  rarestName: number;
}

const RANK: Record<MatchConfidence, number> = { strong: 3, probable: 2, possible: 1 };

/**
 * Order matches by how much they actually tell you.
 *
 * Confidence first, then rarity. Confidence alone falls apart once two trees
 * overlap heavily — a thousand equally-strong matches come back in whatever
 * order the database produced them. A shared Pinkard is a lead; a shared John
 * Smith is a coincidence, and sorting cannot tell them apart without knowing
 * how common the name is.
 */
function compareMatches(a: SharedPerson, b: SharedPerson): number {
  return RANK[b.confidence] - RANK[a.confidence] || a.nameFrequency - b.nameFrequency;
}

function personName(given: string | null, surname: string | null): string {
  return [given, surname].filter(Boolean).join(' ').trim() || 'Unnamed';
}

/**
 * Overlaps grouped by the other researcher.
 *
 * The lookup returns one row per pair of individuals, so a user who shares four
 * ancestors with someone appears four times. The dashboard wants one card per
 * person, ordered by how strong the connection is.
 */
export async function getOverlapsByResearcher(
  userId: string,
): Promise<ResearcherOverlap[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('find_tree_overlaps', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[tree-connections] overlap lookup failed:', error);
    return [];
  }

  const byUser = new Map<string, ResearcherOverlap>();

  for (const row of (data ?? []) as OverlapRow[]) {
    let entry = byUser.get(row.other_user_id);
    if (!entry) {
      entry = {
        userId: row.other_user_id,
        handle: row.other_handle,
        displayName: row.other_display_name || row.other_handle || 'A researcher',
        avatarUrl: row.other_avatar_url,
        people: [],
        bestConfidence: 'possible',
        rarestName: Number.MAX_SAFE_INTEGER,
      };
      byUser.set(row.other_user_id, entry);
    }

    // The same person can match several of their individuals; keep the
    // strongest so a card doesn't list one ancestor three times.
    const existing = entry.people.find((p) => p.individualId === row.my_individual_id);
    if (existing) {
      if (RANK[row.confidence] > RANK[existing.confidence]) {
        existing.confidence = row.confidence;
        existing.theirBirthYear = row.other_birth_year;
        existing.theirBirthPlace = row.other_birth_place;
      }
      continue;
    }

    entry.people.push({
      individualId: row.my_individual_id,
      treeId: row.my_tree_id,
      name: personName(row.given_name, row.surname),
      birthYear: row.birth_year,
      birthPlace: row.birth_place,
      theirBirthYear: row.other_birth_year,
      theirBirthPlace: row.other_birth_place,
      confidence: row.confidence,
      nameFrequency: row.name_frequency ?? 1,
    });

    if (RANK[row.confidence] > RANK[entry.bestConfidence]) {
      entry.bestConfidence = row.confidence;
    }
    if ((row.name_frequency ?? 1) < entry.rarestName) {
      entry.rarestName = row.name_frequency ?? 1;
    }
  }

  return [...byUser.values()]
    .map((entry) => ({ ...entry, people: entry.people.sort(compareMatches) }))
    .sort(
      (a, b) =>
        RANK[b.bestConfidence] - RANK[a.bestConfidence] ||
        // The researcher sharing your rarest name is the one worth contacting,
        // not the one sharing the most names.
        a.rarestName - b.rarestName ||
        b.people.length - a.people.length,
    );
}

/**
 * How many other researchers hold each of a user's individuals.
 *
 * Feeds the badge in the tree view, so it returns counts rather than the whole
 * match set — the tree renders hundreds of people at once.
 */
export async function getOverlapCountsByIndividual(
  userId: string,
): Promise<Record<string, number>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('find_tree_overlaps', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[tree-connections] overlap counts failed:', error);
    return {};
  }

  const researchersPerIndividual = new Map<string, Set<string>>();
  for (const row of (data ?? []) as OverlapRow[]) {
    const set = researchersPerIndividual.get(row.my_individual_id) ?? new Set();
    set.add(row.other_user_id);
    researchersPerIndividual.set(row.my_individual_id, set);
  }

  return Object.fromEntries(
    [...researchersPerIndividual].map(([id, users]) => [id, users.size]),
  );
}

/** Whether this user has opted in. */
export async function isSharingEnabled(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('tree_sharing_enabled')
    .eq('id', userId)
    .maybeSingle();
  return Boolean(data?.tree_sharing_enabled);
}

/**
 * Get or create the conversation between two users.
 *
 * The pair is stored with the lower uuid first so there is exactly one row per
 * pair however the conversation started.
 */
export async function getOrCreateConversation(
  userId: string,
  otherUserId: string,
  about?: { individualId?: string | null; name?: string | null },
): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const [a, b] = [userId, otherUserId].sort();

  const { data: existing } = await supabase
    .from('tree_conversations')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('tree_conversations')
    .insert({
      user_a: a,
      user_b: b,
      about_individual_id: about?.individualId ?? null,
      about_name: about?.name ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[tree-connections] could not open conversation:', error);
    return null;
  }
  return data;
}
