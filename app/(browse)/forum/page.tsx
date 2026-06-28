import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare, Flame, Clock, TrendingUp, PenLine } from 'lucide-react';
import { getFeed } from '@/lib/forum/feed';
import { PostCard } from '@/components/forum/post-card';
import { Avatar } from '@/components/forum/avatar';
import { NotificationBell } from '@/components/forum/notification-bell';
import { FeedLeftRail } from '@/components/forum/feed-left-rail';
import { FeedRightRail, type FollowedUser } from '@/components/forum/feed-right-rail';
import { OnboardingGate } from '@/components/forum/onboarding-gate';
import type { FeedSort, Profile } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Community Feed',
};

const SORTS: { key: FeedSort; label: string; icon: typeof Flame }[] = [
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'new', label: 'New', icon: Clock },
  { key: 'top', label: 'Top', icon: TrendingUp },
];

function followName(p: {
  display_name?: string | null;
  handle?: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  if (full) return full;
  if (p.handle?.trim()) return p.handle.trim();
  return 'Researcher';
}

interface Props {
  searchParams: Promise<{ sort?: string; category?: string; page?: string }>;
}

export default async function ForumPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sort: FeedSort = sp.sort === 'new' || sp.sort === 'top' ? sp.sort : 'hot';
  const categorySlug = sp.category;
  const page = Math.max(1, parseInt(sp.page || '1'));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The viewer's own profile (for the onboarding gate) + the people they follow.
  let viewerProfile: Profile | null = null;
  let following: FollowedUser[] = [];
  if (user) {
    const [{ data: profileRow }, { data: followRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
        .from('forum_follows')
        .select('target_id')
        .eq('user_id', user.id)
        .eq('target_type', 'user'),
    ]);
    viewerProfile = (profileRow as Profile) ?? null;

    const followIds = [...new Set((followRows ?? []).map((f) => f.target_id))];
    if (followIds.length > 0) {
      const { data: followed } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, display_name, handle, avatar_url')
        .in('id', followIds);
      following = (followed ?? []).map((p) => ({
        id: p.id,
        displayName: followName(p),
        handle: p.handle ?? null,
        avatarUrl: p.avatar_url ?? null,
      }));
    }
  }

  const { data: categories } = await supabase
    .from('forum_categories')
    .select('id, name, slug')
    .order('sort_order');

  if (!categories || categories.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Forum Coming Soon"
        description="The community forum is being set up. Check back soon!"
      />
    );
  }

  const { items, hasMore } = await getFeed(supabase, {
    sort,
    categorySlug,
    page,
    viewerId: user?.id ?? null,
  });

  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const qs = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = { sort, category: categorySlug, ...over };
    if (merged.sort && merged.sort !== 'hot') params.set('sort', merged.sort);
    if (merged.category) params.set('category', merged.category);
    if (merged.page && merged.page !== '1') params.set('page', merged.page);
    const s = params.toString();
    return `/forum${s ? `?${s}` : ''}`;
  };

  return (
    <div className="flex gap-6 justify-center">
      {/* Left rail — dashboard navigation */}
      <FeedLeftRail />

      {/* Center — the feed */}
      <div className="w-full max-w-[640px] min-w-0">
        {/* Onboarding for new community members (signed-in, no handle yet). */}
        {user && (
          <OnboardingGate
            hasHandle={!!viewerProfile?.handle}
            firstName={viewerProfile?.first_name ?? null}
            lastName={viewerProfile?.last_name ?? null}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-gold/80">Community</p>
            <h1 className="font-display text-2xl font-semibold text-brand-cream">
              {activeCategory ? activeCategory.name : 'Community Feed'}
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <Link
                href="/forum/profile"
                className="text-xs text-brand-muted hover:text-brand-gold transition-colors hidden sm:inline"
              >
                My profile
              </Link>
              <NotificationBell />
            </div>
          )}
        </div>

        {/* Composer entry */}
        <Link
          href={`/forum/new${categorySlug ? `?category=${categorySlug}` : ''}`}
          className="flex items-center gap-3 bg-brand-card border border-brand-gold/[0.08] rounded-2xl px-4 py-3 mb-4 hover:border-brand-gold/25 transition-colors"
        >
          {user ? (
            <Avatar name={user.email?.split('@')[0] ?? 'You'} src={viewerProfile?.avatar_url} size={36} />
          ) : (
            <PenLine className="w-5 h-5 text-brand-gold" />
          )}
          <span className="text-sm text-brand-muted">Share something with the community…</span>
          <span className="ml-auto text-xs font-medium text-brand-bg bg-brand-gold rounded-lg px-3 py-1.5">
            Post
          </span>
        </Link>

        {/* Sort tabs */}
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex rounded-xl border border-brand-gold/15 bg-brand-card overflow-hidden">
            {SORTS.map(({ key, label, icon: Icon }) => (
              <Link
                key={key}
                href={qs({ sort: key, page: '1' })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === key ? 'bg-brand-gold text-brand-bg' : 'text-brand-muted hover:text-brand-cream'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Link
            href={qs({ category: undefined, page: '1' })}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
              !categorySlug
                ? 'bg-brand-gold/15 text-brand-gold border border-brand-gold/30'
                : 'text-brand-muted border border-brand-gold/10 hover:text-brand-cream'
            }`}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={qs({ category: c.slug, page: '1' })}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                categorySlug === c.slug
                  ? 'bg-brand-gold/15 text-brand-gold border border-brand-gold/30'
                  : 'text-brand-muted border border-brand-gold/10 hover:text-brand-cream'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {/* Feed */}
        {items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No posts yet"
            description="Be the first to share something with the community."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <PostCard
                key={item.thread.id}
                item={item}
                isSignedIn={!!user}
                currentUserId={user?.id ?? ''}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-center gap-4 mt-8">
            {page > 1 && (
              <Link href={qs({ page: String(page - 1) })} className="text-sm text-brand-gold">
                ← Newer
              </Link>
            )}
            <span className="text-sm text-brand-muted">Page {page}</span>
            {hasMore && (
              <Link href={qs({ page: String(page + 1) })} className="text-sm text-brand-gold">
                Older →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Right rail — ads + following */}
      <FeedRightRail following={following} isSignedIn={!!user} />
    </div>
  );
}
