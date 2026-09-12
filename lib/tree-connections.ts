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

/** PostgREST caps a response at 1000 rows, so every page is asked for. */
const PAGE_SIZE = 1000;

/**
 * Every overlap row for a user.
 *
 * Paginated, not because the result is expected to be huge, but because a plain
 * .rpc() silently returns the first 1000 and says nothing about the rest. Two of
 * the three trees here already produce 1,112 rows, so the unpaginated version
 * was quietly dropping matches — the kind of wrong that looks exactly like
 * working.
 *
 * If this grows past a few thousand, the fix is to aggregate in SQL rather than
 * to raise the page size; the callers only ever want it grouped.
 */
async function fetchAllOverlaps(userId: string): Promise<OverlapRow[]> {
  const supabase = createAdminClient();
  const rows: OverlapRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('find_tree_overlaps', { p_user_id: userId })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[tree-connections] overlap lookup failed:', error);
      return rows;
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as OverlapRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
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
  const byUser = new Map<string, ResearcherOverlap>();

  for (const row of await fetchAllOverlaps(userId)) {
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
  const researchersPerIndividual = new Map<string, Set<string>>();
  for (const row of await fetchAllOverlaps(userId)) {
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

/**
 * The researchers who also hold one specific individual.
 *
 * Powers the panel on a person's page, where the useful question is not "how
 * many" but "who, and can I talk to them".
 */
export async function getResearchersForIndividual(
  userId: string,
  individualId: string,
): Promise<ResearcherOverlap[]> {
  const all = await getOverlapsByResearcher(userId);
  return all
    .map((researcher) => ({
      ...researcher,
      people: researcher.people.filter((p) => p.individualId === individualId),
    }))
    .filter((researcher) => researcher.people.length > 0);
}

/**
 * Tell someone a message arrived.
 *
 * Reuses the forum's notification table so there is one bell rather than two.
 * Never throws: a missing notification must not lose a message that was
 * actually delivered.
 */
export async function notifyNewMessage(input: {
  recipientId: string;
  senderId: string;
  conversationId: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    // One unread notification per conversation. A back-and-forth exchange
    // should not stack ten separate alerts for the same thread.
    const { data: existing } = await supabase
      .from('forum_notifications')
      .select('id')
      .eq('user_id', input.recipientId)
      .eq('conversation_id', input.conversationId)
      .eq('is_read', false)
      .maybeSingle();

    if (existing) return;

    await supabase.from('forum_notifications').insert({
      user_id: input.recipientId,
      actor_id: input.senderId,
      type: 'message',
      conversation_id: input.conversationId,
      is_read: false,
    });
  } catch (e) {
    console.error('[tree-connections] could not create notification:', e);
  }
}

export interface VisibleIndividual {
  id: string;
  givenName: string | null;
  surname: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  /** True when the viewer holds this person too. */
  shared: boolean;
}

export type TreeViewDenial = 'not-signed-in' | 'owner-not-sharing' | 'viewer-not-sharing';

export interface SharedTreeView {
  allowed: boolean;
  denial?: TreeViewDenial;
  individuals: VisibleIndividual[];
  /** Held back by the living-person safeguard, so the gap is stated not hidden. */
  withheld: number;
}

/**
 * Another researcher's tree, as this viewer is allowed to see it.
 *
 * Gated exactly like matching, and for the same reason: this is the same data
 * matching already exposes, shown in bulk rather than a person at a time. Both
 * parties must have sharing on, so nobody can browse trees without offering
 * their own.
 *
 * Anyone who may still be living is withheld unless the tree's owner chose
 * otherwise — the owner's setting governs, never the viewer's.
 */
export async function getSharedTreeView(
  viewerId: string | null,
  ownerId: string,
): Promise<SharedTreeView> {
  const empty = { individuals: [], withheld: 0 };
  if (!viewerId) return { allowed: false, denial: 'not-signed-in', ...empty };

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from('profiles')
    .select('id, tree_sharing_enabled, tree_sharing_include_living')
    .in('id', [viewerId, ownerId]);

  const owner = settings?.find((s) => s.id === ownerId);
  const viewer = settings?.find((s) => s.id === viewerId);

  if (!owner?.tree_sharing_enabled) {
    return { allowed: false, denial: 'owner-not-sharing', ...empty };
  }
  // Viewing is not a lesser act than matching, so it carries the same price.
  if (!viewer?.tree_sharing_enabled) {
    return { allowed: false, denial: 'viewer-not-sharing', ...empty };
  }

  const cutoff = new Date().getFullYear() - 100;
  const rows: {
    id: string;
    given_name: string | null;
    surname: string | null;
    birth_date: string | null;
    birth_place: string | null;
    death_date: string | null;
  }[] = [];

  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from('tree_individuals')
      .select('id, given_name, surname, birth_date, birth_place, death_date')
      .eq('user_id', ownerId)
      .order('surname')
      .order('given_name')
      .range(from, from + 999);

    if (!owner.tree_sharing_include_living) {
      // birth_year is null for undated people, and a null never satisfies lte,
      // so they are withheld too — which is the intent.
      query = query.or(`death_date.not.is.null,birth_year.lte.${cutoff}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[tree-connections] tree view query failed:', error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const { count: total } = await supabase
    .from('tree_individuals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ownerId);

  // Their individuals that the viewer also holds, so the overlap is visible
  // while browsing rather than only on the dashboard.
  const sharedIds = new Set<string>();
  for (const row of await fetchAllOverlaps(viewerId)) {
    if (row.other_user_id === ownerId) sharedIds.add(row.other_individual_id);
  }

  return {
    allowed: true,
    withheld: Math.max(0, (total ?? 0) - rows.length),
    individuals: rows.map((r) => ({
      id: r.id,
      givenName: r.given_name,
      surname: r.surname,
      birthDate: r.birth_date,
      birthPlace: r.birth_place,
      deathDate: r.death_date,
      shared: sharedIds.has(r.id),
    })),
  };
}
