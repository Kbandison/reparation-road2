import Link from 'next/link';
import { TreePine, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOverlapsByResearcher } from '@/lib/tree-connections';
import { ProfileMessageBox } from '@/components/forum/profile-message-box';

/**
 * Research holdings on a public profile.
 *
 * What is shown depends on who is looking, because tree data is opt-in and
 * mutual. Anyone sees the size of the collection — how many trees, how many
 * people — which says "this person has done real work" without naming anybody.
 * The people themselves appear only to a signed-in researcher whose own trees
 * already overlap, which is information the matching feature has already shared
 * with them in both directions.
 */
export async function ProfileTreePanel({
  profileId,
  profileName,
  handle,
  sharingEnabled,
  viewerId,
}: {
  profileId: string;
  profileName: string;
  handle: string;
  sharingEnabled: boolean;
  viewerId: string | null;
}) {
  if (!sharingEnabled) return null;

  const admin = createAdminClient();

  const [{ count: treeCount }, { count: peopleCount }] = await Promise.all([
    admin
      .from('family_trees')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId),
    admin
      .from('tree_individuals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId),
  ]);

  if (!treeCount) return null;

  // Overlaps are computed from the viewer's side: the lookup already refuses to
  // answer unless both parties have sharing on, so nothing here can leak to
  // someone who has not opted in themselves.
  const shared =
    viewerId && viewerId !== profileId
      ? (await getOverlapsByResearcher(viewerId)).find((o) => o.userId === profileId)
      : undefined;

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <h2 className="font-display text-lg font-semibold text-brand-cream mb-1 inline-flex items-center gap-2">
        <TreePine className="w-4 h-4 text-brand-sage" />
        Research
      </h2>
      <p className="text-sm text-brand-muted">
        {treeCount} {treeCount === 1 ? 'tree' : 'trees'} ·{' '}
        {(peopleCount ?? 0).toLocaleString()} people recorded
      </p>

      {viewerId && viewerId !== profileId && (
        <Link
          href={`/forum/u/${handle}/tree`}
          className="inline-block mt-2 text-xs text-brand-gold hover:text-brand-gold-light"
        >
          Browse {profileName}&rsquo;s research &rarr;
        </Link>
      )}

      {shared && shared.people.length > 0 ? (
        <div className="mt-4 border-t border-brand-gold/[0.08] pt-4">
          <p className="text-sm text-brand-cream inline-flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-brand-gold" />
            You both have {shared.people.length}{' '}
            {shared.people.length === 1 ? 'person' : 'people'}
          </p>
          <ul className="space-y-1.5">
            {shared.people.slice(0, 8).map((p) => (
              <li key={p.individualId} className="flex items-center gap-2 flex-wrap text-sm">
                <Link
                  href={`/family-tree/${p.treeId}/person/${p.individualId}`}
                  className="text-brand-cream hover:text-brand-gold"
                >
                  {p.name}
                </Link>
                {p.birthYear && (
                  <span className="text-xs text-brand-muted tabular-nums">b. {p.birthYear}</span>
                )}
                {p.nameFrequency <= 3 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-burgundy/20 text-brand-burgundy-light">
                    Rare name
                  </span>
                )}
              </li>
            ))}
            {shared.people.length > 8 && (
              <li className="text-xs text-brand-muted">
                and {shared.people.length - 8} more
              </li>
            )}
          </ul>
          {/* Person links point at the viewer's own copy. Browsing someone
              else's tree is a separate surface that does not exist yet. */}
          <ProfileMessageBox
            toUserId={profileId}
            toName={profileName}
            aboutName={shared.people[0]?.name}
          />
        </div>
      ) : viewerId && viewerId !== profileId ? (
        <p className="text-xs text-brand-muted/80 mt-3">
          No people in common with your trees yet. Turn on tree sharing from your
          dashboard if you haven&rsquo;t — matching only works both ways.
        </p>
      ) : null}
    </div>
  );
}
