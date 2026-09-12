import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Lock, TreePine } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getSharedTreeView } from '@/lib/tree-connections';
import { profileName } from '@/lib/utils/profile-name';
import { SharedTreeList } from '@/components/forum/shared-tree-list';
import type { Profile } from '@/lib/types';

interface Props {
  params: Promise<{ handle: string }>;
}

export const metadata: Metadata = { title: 'Research tree — Community' };

const card = 'bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6';

export default async function SharedTreePage({ params }: Props) {
  const { handle } = await params;
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

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href={`/forum/u/${handle}`}
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-cream mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {name}&rsquo;s profile
      </Link>

      <h1 className="font-display text-2xl font-semibold text-brand-cream mb-1 inline-flex items-center gap-2">
        <TreePine className="w-5 h-5 text-brand-sage" />
        {name}&rsquo;s research
      </h1>

      {!view.allowed ? (
        <div className={`${card} mt-4`}>
          <p className="text-sm text-brand-cream inline-flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-muted" />
            {view.denial === 'not-signed-in' && 'Sign in to see this.'}
            {view.denial === 'owner-not-sharing' &&
              `${name} hasn’t turned on tree sharing.`}
            {view.denial === 'viewer-not-sharing' &&
              'Tree sharing works both ways.'}
          </p>
          <p className="text-sm text-brand-muted mt-2 leading-relaxed">
            {view.denial === 'not-signed-in' && (
              <>
                Research trees are visible to signed-in researchers who share
                theirs too.{' '}
                <Link href="/login" className="text-brand-gold hover:underline">
                  Sign in
                </Link>
                .
              </>
            )}
            {view.denial === 'owner-not-sharing' &&
              'Only researchers who share their own trees appear here.'}
            {/* Stated plainly: you cannot browse other people's research while
                keeping yours private. */}
            {view.denial === 'viewer-not-sharing' && (
              <>
                You can see another researcher&rsquo;s tree while yours is visible
                to them as well. Turn it on from your{' '}
                <Link href="/dashboard" className="text-brand-gold hover:underline">
                  dashboard
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : view.individuals.length === 0 ? (
        <div className={`${card} mt-4`}>
          <p className="text-sm text-brand-muted">
            {name} hasn&rsquo;t added anyone that can be shown here yet.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-brand-muted">
            {view.individuals.length.toLocaleString()} people
            {view.withheld > 0 && (
              <>
                {' '}&middot;{' '}
                <span title="No death date, and either born within the last hundred years or carrying no dates at all">
                  {view.withheld.toLocaleString()} withheld as possibly living
                </span>
              </>
            )}
          </p>
          <SharedTreeList individuals={view.individuals} ownerName={name} />
        </div>
      )}
    </div>
  );
}
