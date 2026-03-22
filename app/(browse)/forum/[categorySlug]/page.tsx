import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus, Pin, Lock, MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const supabase = await createClient();
  const { data: category } = await supabase
    .from('forum_categories')
    .select('name')
    .eq('slug', categorySlug)
    .single();
  return { title: category?.name || 'Forum Category' };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { categorySlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const pageSize = 20;

  const supabase = await createClient();

  const { data: category } = await supabase
    .from('forum_categories')
    .select('*')
    .eq('slug', categorySlug)
    .single();

  if (!category) notFound();

  // Fetch threads without joins first — profile/post joins can fail silently
  // and cause the entire query to return null data
  const { data: threads, count, error: threadsError } = await supabase
    .from('forum_threads')
    .select('*', { count: 'exact' })
    .eq('category_id', category.id)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (threadsError) {
    console.error('Error fetching threads:', threadsError);
  }

  // Fetch profiles and post counts separately for each thread
  const threadIds = (threads || []).map((t) => t.id);
  let profilesMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
  let postCountMap: Record<string, number> = {};

  if (threadIds.length > 0) {
    // Fetch profiles for thread authors
    const userIds = [...new Set((threads || []).map((t) => t.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', userIds);

    if (profiles) {
      for (const p of profiles) {
        profilesMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
      }
    }

    // Fetch post counts per thread
    const { data: postCounts } = await supabase
      .from('forum_posts')
      .select('thread_id')
      .in('thread_id', threadIds);

    if (postCounts) {
      for (const pc of postCounts) {
        postCountMap[pc.thread_id] = (postCountMap[pc.thread_id] || 0) + 1;
      }
    }
  }

  const totalPages = Math.ceil((count || 0) / pageSize);

  return (
    <>
      <div className="mb-2">
        <Link href="/forum" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          &larr; All Categories
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8">
        <PageHeader title={category.name} description={category.description || undefined} />

        <Link href={`/forum/new?category=${categorySlug}`}>
          <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl flex-shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            New Thread
          </Button>
        </Link>
      </div>

      {!threads || threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No Threads Yet"
          description="Be the first to start a discussion in this category."
          action={
            <Link href={`/forum/new?category=${categorySlug}`}>
              <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
                Start a Thread
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => {
            const postCount = postCountMap[thread.id] || 0;
            const profile = profilesMap[thread.user_id];
            const authorName = profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Anonymous'
              : 'Anonymous';

            return (
              <Link
                key={thread.id}
                href={`/forum/thread/${thread.slug}`}
                className="block bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 hover:border-brand-gold/25 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {thread.is_pinned && <Pin className="w-3.5 h-3.5 text-brand-gold" />}
                      {thread.is_locked && <Lock className="w-3.5 h-3.5 text-brand-muted" />}
                      <h3 className="text-sm font-medium text-brand-cream truncate">
                        {thread.title}
                      </h3>
                    </div>
                    <p className="text-xs text-brand-muted">
                      by {authorName} &middot;{' '}
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-brand-muted">{postCount} replies</span>
                    <span className="text-xs text-brand-muted">{thread.view_count} views</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          {page > 1 && (
            <Link href={`/forum/${categorySlug}?page=${page - 1}`} className="text-sm text-brand-gold">
              Previous
            </Link>
          )}
          <span className="text-sm text-brand-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/forum/${categorySlug}?page=${page + 1}`} className="text-sm text-brand-gold">
              Next
            </Link>
          )}
        </div>
      )}
    </>
  );
}
