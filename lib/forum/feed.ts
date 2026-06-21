import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedItem, FeedSort, ForumAuthor, ForumThread } from '@/lib/types';

// Builds the social feed: threads across all (or one) category, assembled with
// author, reply count, vote count, the viewer's own vote, and a hot score.
//
// Everything degrades gracefully before the social migration is run — vote
// counts read as 0, sorting falls back to recency, and the new columns simply
// come back undefined.

interface FeedOptions {
  sort?: FeedSort;
  categorySlug?: string;
  page?: number;
  pageSize?: number;
  viewerId?: string | null;
}

// Reddit-style hot ranking: log-scaled score plus an age term, so a few strong
// upvotes lift a post but fresh activity still surfaces.
function hotScore(votes: number, replies: number, createdAt: string): number {
  const score = votes + replies * 0.5;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const seconds = new Date(createdAt).getTime() / 1000 - 1_700_000_000;
  return order + seconds / 45000;
}

function authorName(p: {
  display_name?: string | null;
  handle?: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (p.display_name?.trim()) return p.display_name.trim();
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  if (full) return full;
  if (p.handle?.trim()) return p.handle.trim();
  return 'Anonymous';
}

export async function getFeed(
  supabase: SupabaseClient,
  opts: FeedOptions = {},
): Promise<{ items: FeedItem[]; hasMore: boolean }> {
  const { sort = 'hot', categorySlug, page = 1, pageSize = 20, viewerId } = opts;

  // Resolve a category filter to its id.
  let categoryId: string | null = null;
  const categoryMap = new Map<string, { slug: string; name: string }>();
  {
    const { data: cats } = await supabase
      .from('forum_categories')
      .select('id, slug, name');
    for (const c of cats ?? []) {
      categoryMap.set(c.id, { slug: c.slug, name: c.name });
      if (categorySlug && c.slug === categorySlug) categoryId = c.id;
    }
  }

  // For hot/top we rank in app code over a recent window; for new we can page
  // directly. The forum is small enough that a windowed fetch is fine, and it
  // keeps ranking flexible without DB functions.
  const WINDOW = sort === 'new' ? pageSize : 250;
  const from = sort === 'new' ? (page - 1) * pageSize : 0;

  let query = supabase
    .from('forum_threads')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + WINDOW); // +1 to detect hasMore for 'new'
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data: threadsRaw } = await query;
  const threads = (threadsRaw ?? []) as ForumThread[];

  if (threads.length === 0) return { items: [], hasMore: false };

  // Authors, reply counts, and the viewer's votes — fetched separately because
  // PostgREST joins on these have historically failed silently here.
  const userIds = [...new Set(threads.map((t) => t.user_id))];
  const threadIds = threads.map((t) => t.id);

  const [{ data: profiles }, { data: replyRows }, { data: voteRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, display_name, handle, avatar_url')
      .in('id', userIds),
    supabase.from('forum_posts').select('thread_id').in('thread_id', threadIds),
    viewerId
      ? supabase
          .from('forum_votes')
          .select('thread_id, value')
          .eq('user_id', viewerId)
          .in('thread_id', threadIds)
      : Promise.resolve({ data: [] as { thread_id: string; value: number }[] }),
  ]);

  const authorMap = new Map<string, ForumAuthor>();
  for (const p of profiles ?? []) {
    authorMap.set(p.id, {
      id: p.id,
      displayName: authorName(p),
      handle: p.handle ?? null,
      avatarUrl: p.avatar_url ?? null,
    });
  }

  const replyCountMap = new Map<string, number>();
  for (const r of replyRows ?? []) {
    replyCountMap.set(r.thread_id, (replyCountMap.get(r.thread_id) ?? 0) + 1);
  }

  const myVoteMap = new Map<string, number>();
  for (const v of (voteRows as { thread_id: string; value: number }[]) ?? []) {
    myVoteMap.set(v.thread_id, v.value);
  }

  const items: FeedItem[] = threads.map((thread) => {
    const cat = categoryMap.get(thread.category_id);
    const replyCount = replyCountMap.get(thread.id) ?? 0;
    const voteCount = thread.vote_count ?? 0;
    return {
      thread,
      author:
        authorMap.get(thread.user_id) ??
        { id: thread.user_id, displayName: 'Anonymous', handle: null, avatarUrl: null },
      categorySlug: cat?.slug ?? '',
      categoryName: cat?.name ?? 'General',
      replyCount,
      voteCount,
      myVote: myVoteMap.get(thread.id) ?? 0,
      hotScore: hotScore(voteCount, replyCount, thread.created_at),
    };
  });

  // Sort (pinned always first), then paginate hot/top in app code.
  const pinned = items.filter((i) => i.thread.is_pinned);
  const rest = items.filter((i) => !i.thread.is_pinned);

  if (sort === 'hot') {
    rest.sort((a, b) => b.hotScore - a.hotScore);
  } else if (sort === 'top') {
    rest.sort((a, b) => b.voteCount - a.voteCount || b.replyCount - a.replyCount);
  }
  // 'new' is already ordered by created_at from the query.

  if (sort === 'new') {
    const pageItems = rest.slice(0, pageSize);
    return { items: [...pinned, ...pageItems], hasMore: rest.length > pageSize };
  }

  const start = (page - 1) * pageSize;
  const pageItems = rest.slice(start, start + pageSize);
  return {
    items: page === 1 ? [...pinned, ...pageItems] : pageItems,
    hasMore: rest.length > start + pageSize,
  };
}
