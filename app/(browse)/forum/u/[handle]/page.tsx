import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from '@/components/forum/avatar';
import { ProfileEditButton } from '@/components/forum/profile-edit-button';
import { deriveBadges } from '@/lib/forum/badges';
import { Award, MessageSquare, ArrowBigUp, MapPin, Users } from 'lucide-react';
import type { Profile, ForumThread } from '@/lib/types';

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle} — Community` };
}

function displayName(p: Profile): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return full || p.handle || 'Researcher';
}

export default async function ProfilePage({ params }: Props) {
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

  const { data: threadsRaw } = await supabase
    .from('forum_threads')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(30);
  const threads = (threadsRaw as ForumThread[]) ?? [];

  const findCount = threads.filter((t) => t.post_type === 'find').length;
  const badges = deriveBadges({
    karma: profile.karma ?? 0,
    threadCount: threads.length,
    findCount,
    hasInterests:
      (profile.research_surnames?.length ?? 0) > 0 || (profile.research_regions?.length ?? 0) > 0,
  });

  const isOwn = user?.id === profile.id;
  const name = displayName(profile);

  return (
    <>
      <div className="mb-4">
        <Link href="/forum" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          ← Community Feed
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar name={name} src={profile.avatar_url} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-semibold text-brand-cream truncate">{name}</h1>
                {profile.handle && <p className="text-sm text-brand-muted">@{profile.handle}</p>}
              </div>
              {isOwn && <ProfileEditButton profile={profile} />}
            </div>

            {profile.bio && <p className="text-sm text-brand-cream/90 mt-3 leading-relaxed">{profile.bio}</p>}

            <div className="flex items-center gap-4 mt-3 text-xs text-brand-muted">
              <span className="inline-flex items-center gap-1">
                <ArrowBigUp className="w-3.5 h-3.5 text-brand-gold" /> {profile.karma ?? 0} karma
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> {threads.length} posts
              </span>
              <span>Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}</span>
            </div>
          </div>
        </div>

        {/* Research interests */}
        {((profile.research_surnames?.length ?? 0) > 0 || (profile.research_regions?.length ?? 0) > 0) && (
          <div className="mt-5 pt-4 border-t border-brand-gold/[0.06] grid sm:grid-cols-2 gap-4">
            {(profile.research_surnames?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-1.5 inline-flex items-center gap-1">
                  <Users className="w-3 h-3" /> Surnames
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.research_surnames!.map((s) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(profile.research_regions?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-1.5 inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Regions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.research_regions!.map((r) => (
                    <span key={r} className="text-xs px-2 py-0.5 rounded-md bg-brand-sage/10 text-brand-sage">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-brand-gold/[0.06]">
            <p className="text-[11px] uppercase tracking-wide text-brand-muted mb-2 inline-flex items-center gap-1">
              <Award className="w-3 h-3" /> Badges
            </p>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.key}
                  title={b.description}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-brand-card-hover border border-brand-gold/15 text-brand-cream"
                >
                  <Award className="w-3 h-3 text-brand-gold" /> {b.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Post history */}
      <h2 className="font-display text-lg font-semibold text-brand-cream mb-3">Posts</h2>
      {threads.length === 0 ? (
        <p className="text-sm text-brand-muted">No posts yet.</p>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/forum/thread/${t.slug}`}
              className="block bg-brand-card border border-brand-gold/[0.08] rounded-xl p-3.5 hover:border-brand-gold/25 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-brand-cream truncate">{t.title}</h3>
                <span className="text-xs text-brand-muted inline-flex items-center gap-1 flex-shrink-0">
                  <ArrowBigUp className="w-3.5 h-3.5" /> {t.vote_count ?? 0}
                </span>
              </div>
              <p className="text-xs text-brand-muted mt-0.5">
                {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
