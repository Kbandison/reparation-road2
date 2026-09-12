import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Lock, ExternalLink, Link2, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getSharedTreeView } from '@/lib/tree-connections';
import { profileName } from '@/lib/utils/profile-name';
import type { Profile, TreeIndividual } from '@/lib/types';

interface Props {
  params: Promise<{ handle: string; personId: string }>;
}

export const metadata: Metadata = { title: 'Person — Community' };

const card = 'bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6';

function fullName(p: TreeIndividual): string {
  return [p.given_name, p.surname].filter(Boolean).join(' ').trim() || 'Unnamed';
}

/**
 * One person in another researcher's tree.
 *
 * The same gate as the tree itself, and built from the same call — so a person
 * the safeguard withholds is simply not in the list and cannot be reached by
 * guessing the URL.
 *
 * Shows more than the modal can: who they are connected to, which is the part
 * that tells you whether their line is your line.
 */
export default async function SharedPersonPage({ params }: Props) {
  const { handle, personId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle();
  if (!profileRaw) notFound();

  const profile = profileRaw as Profile;
  const name = profileName(profile);
  const view = await getSharedTreeView(user?.id ?? null, profile.id);

  if (!view.allowed) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className={card}>
          <p className="text-sm text-brand-cream inline-flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-muted" /> Not available
          </p>
          <p className="text-sm text-brand-muted mt-2">
            Research trees are visible to signed-in researchers who share theirs too.{' '}
            <Link href={`/forum/u/${handle}`} className="text-brand-gold hover:underline">
              Back to {name}&rsquo;s profile
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const person = view.rawIndividuals.find((i) => i.id === personId);
  // Withheld people are absent from the list, so this covers both "no such
  // person" and "not yours to see" without distinguishing them.
  if (!person) notFound();

  const byId = new Map(view.rawIndividuals.map((i) => [i.id, i]));
  const parents = view.relationships
    .filter((r) => r.type === 'parent' && r.to_id === person.id)
    .map((r) => byId.get(r.from_id))
    .filter(Boolean) as TreeIndividual[];
  const children = view.relationships
    .filter((r) => r.type === 'parent' && r.from_id === person.id)
    .map((r) => byId.get(r.to_id))
    .filter(Boolean) as TreeIndividual[];
  const spouses = view.relationships
    .filter((r) => r.type === 'spouse' && (r.from_id === person.id || r.to_id === person.id))
    .map((r) => byId.get(r.from_id === person.id ? r.to_id : r.from_id))
    .filter(Boolean) as TreeIndividual[];

  const yourCopy = view.overlapLinks[person.id];
  const facts: [string, string][] = [];
  if (person.sex === 'M' || person.sex === 'F') {
    facts.push(['Sex', person.sex === 'M' ? 'Male' : 'Female']);
  }
  if (person.birth_date) facts.push(['Born', person.birth_date]);
  if (person.birth_place) facts.push(['Birthplace', person.birth_place]);
  if (person.death_date) facts.push(['Died', person.death_date]);
  if (person.death_place) facts.push(['Place of death', person.death_place]);
  if (person.occupation) facts.push(['Occupation', person.occupation]);

  const groups: [string, TreeIndividual[]][] = [
    ['Parents', parents],
    ['Spouses', spouses],
    ['Children', children],
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/forum/u/${handle}/tree`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-cream mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {name}&rsquo;s research
      </Link>

      <div className={card}>
        <div className="flex items-start gap-4">
          {person.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photo_url}
              alt={fullName(person)}
              className="w-20 h-20 rounded-full object-cover border border-brand-gold/15 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-gold/10 text-brand-gold flex items-center justify-center text-xl font-semibold shrink-0">
              {(person.given_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-brand-cream">
              {fullName(person)}
            </h1>
            <p className="text-xs text-brand-muted mt-1">In {name}&rsquo;s tree</p>
          </div>
        </div>

        {facts.length > 0 && (
          <dl className="mt-5 space-y-2">
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-3 text-sm">
                <dt className="text-brand-muted w-36 shrink-0">{label}</dt>
                <dd className="text-brand-cream">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {person.archive_record_id && person.archive_collection_slug && (
          <Link
            href={`/collection/${person.archive_collection_slug}/${person.archive_record_id}`}
            className="mt-5 inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
          >
            <Link2 className="w-3.5 h-3.5" />
            {person.archive_record_title || 'Linked archive record'}
          </Link>
        )}

        {yourCopy && (
          <div className="mt-5 border-t border-brand-gold/[0.08] pt-4">
            <p className="text-sm text-brand-cream inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-gold" /> You have this person too
            </p>
            <Link
              href={`/family-tree/${yourCopy.treeId}/person/${yourCopy.individualId}`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
            >
              Open your record <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {groups.some(([, list]) => list.length > 0) && (
        <div className={`${card} mt-6`}>
          <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">
            Relationships
          </h2>
          <div className="space-y-4">
            {groups
              .filter(([, list]) => list.length > 0)
              .map(([label, list]) => (
                <div key={label}>
                  <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-1.5">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((rel) => (
                      <Link
                        key={rel.id}
                        href={`/forum/u/${handle}/tree/${rel.id}`}
                        className="rounded-xl border border-brand-gold/[0.12] px-3 py-1.5 text-sm text-brand-cream hover:border-brand-gold/35"
                      >
                        {fullName(rel)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          {/* Relationships to withheld people are absent, same as on the canvas —
              an empty slot would hint at someone deliberately not shown. */}
        </div>
      )}
    </div>
  );
}
