import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare, Flame, Clock, TrendingUp, PenLine } from 'lucide-react';
import { getFeed } from '@/lib/forum/feed';
import { PostCard } from '@/components/forum/post-card';
import { Avatar } from '@/components/forum/avatar';
import type { FeedSort } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Community Forum',
};

const SORTS: { key: FeedSort; label: string; icon: typeof Flame }[] = [
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'new', label: 'New', icon: Clock },
  { key: 'top', label: 'Top', icon: TrendingUp },
];

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

  const { data: categories } = await supabase
    .from('forum_categories')
    .select('id, name, slug')
    .order('sort_order');

  if (!categories || categories.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Community" title="Forum" />
        <EmptyState
          icon={MessageSquare}
          title="Forum Coming Soon"
          description="The community forum is being set up. Check back soon!"
        />
      </>
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
    <>
      <PageHeader
        eyebrow="Community"
        title={activeCategory ? activeCategory.name : 'Community Feed'}
        description="Share discoveries, ask for research help, and connect with fellow researchers."
      />

      {/* Composer entry */}
      <Link
        href={`/forum/new${categorySlug ? `?category=${categorySlug}` : ''}`}
        className="flex items-center gap-3 bg-brand-card border border-brand-gold/[0.08] rounded-2xl px-4 py-3 mb-5 hover:border-brand-gold/25 transition-colors"
      >
        {user ? (
          <Avatar name={user.email?.split('@')[0] ?? 'You'} size={32} />
        ) : (
          <PenLine className="w-5 h-5 text-brand-gold" />
        )}
        <span className="text-sm text-brand-muted">Share something with the community…</span>
        <span className="ml-auto text-xs font-medium text-brand-bg bg-brand-gold rounded-lg px-3 py-1.5">
          Post
        </span>
      </Link>

      {/* Sort tabs + category filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
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
        {user && (
          <Link
            href="/forum/profile"
            className="ml-auto text-xs text-brand-muted hover:text-brand-gold transition-colors"
          >
            My profile
          </Link>
        )}
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
            <PostCard key={item.thread.id} item={item} isSignedIn={!!user} />
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
    </>
  );
}
