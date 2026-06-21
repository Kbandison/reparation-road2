import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ReactionBar } from '@/components/forum/reaction-bar';
import { ReplyEditor } from '@/components/forum/reply-editor';
import { VoteButton } from '@/components/forum/vote-button';
import { PostAttachments } from '@/components/forum/post-attachments';
import { FollowButton } from '@/components/forum/follow-button';
import { MessageSquare, Search, HelpCircle } from 'lucide-react';
import type { ForumPostType } from '@/lib/types';

const POST_TYPE_META: Record<ForumPostType, { label: string; icon: typeof Search; cls: string }> = {
  discussion: { label: 'Discussion', icon: MessageSquare, cls: 'text-brand-muted' },
  find: { label: 'Share a Find', icon: Search, cls: 'text-brand-gold' },
  help: { label: 'Research Help', icon: HelpCircle, cls: 'text-brand-sage' },
};

interface Props {
  params: Promise<{ threadSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { threadSlug } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from('forum_threads')
    .select('title')
    .eq('slug', threadSlug)
    .single();
  return { title: thread?.title || 'Thread' };
}

export default async function ThreadPage({ params }: Props) {
  const { threadSlug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch thread without joins
  const { data: thread, error: threadError } = await supabase
    .from('forum_threads')
    .select('*')
    .eq('slug', threadSlug)
    .single();

  if (threadError) {
    console.error('Error fetching thread:', threadError);
  }

  if (!thread) notFound();

  // The viewer's vote + follow state on this thread.
  let myVote = 0;
  let followingThread = false;
  if (user) {
    const [{ data: voteRow }, { data: followRow }] = await Promise.all([
      supabase.from('forum_votes').select('value').eq('user_id', user.id).eq('thread_id', thread.id).maybeSingle(),
      supabase
        .from('forum_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('target_type', 'thread')
        .eq('target_id', thread.id)
        .maybeSingle(),
    ]);
    myVote = voteRow?.value ?? 0;
    followingThread = !!followRow;
  }

  // Fetch category separately
  let category: { name: string; slug: string } | null = null;
  if (thread.category_id) {
    const { data } = await supabase
      .from('forum_categories')
      .select('name, slug')
      .eq('id', thread.category_id)
      .single();
    category = data;
  }

  // Fetch thread author profile separately
  let threadProfile: { first_name: string | null; last_name: string | null; email: string | null } | null = null;
  if (thread.user_id) {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', thread.user_id)
      .single();
    threadProfile = data;
  }

  // Increment view count (use admin client to bypass RLS)
  const adminClient = createAdminClient();
  await adminClient
    .from('forum_threads')
    .update({ view_count: (thread.view_count || 0) + 1 })
    .eq('id', thread.id);

  // Fetch posts without joins
  const { data: posts } = await supabase
    .from('forum_posts')
    .select('*')
    .eq('thread_id', thread.id)
    .order('created_at');

  // Fetch profiles for post authors separately
  const postUserIds = [...new Set((posts || []).map((p) => p.user_id))];
  const postProfilesMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {};
  if (postUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', postUserIds);
    if (profiles) {
      for (const p of profiles) {
        postProfilesMap[p.id] = { first_name: p.first_name, last_name: p.last_name, email: p.email };
      }
    }
  }

  // Fetch reactions
  const postIds = (posts || []).map((p) => p.id);
  let reactions: Record<string, unknown>[] = [];
  if (postIds.length > 0) {
    const { data } = await supabase
      .from('forum_reactions')
      .select('*')
      .in('post_id', postIds);
    reactions = data || [];
  }

  const threadAuthor = threadProfile
    ? `${threadProfile.first_name || ''} ${threadProfile.last_name || ''}`.trim() || 'Anonymous'
    : 'Anonymous';
  const threadInitials = threadProfile
    ? `${(threadProfile.first_name || '')[0] || ''}${(threadProfile.last_name || '')[0] || ''}`
    : '?';

  return (
    <>
      <div className="mb-2">
        <Link href={`/forum/${category?.slug || ''}`} className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          &larr; {category?.name || 'Back'}
        </Link>
      </div>

      {(() => {
        const tm = POST_TYPE_META[(thread.post_type as ForumPostType) ?? 'discussion'] ?? POST_TYPE_META.discussion;
        const TypeIcon = tm.icon;
        return (
          <span className={`inline-flex items-center gap-1 text-xs mb-2 ${tm.cls}`}>
            <TypeIcon className="w-3.5 h-3.5" /> {tm.label}
          </span>
        );
      })()}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-brand-cream">
          {thread.title}
        </h1>
        <div className="flex-shrink-0 pt-1">
          <FollowButton
            targetType="thread"
            targetId={thread.id}
            initialFollowing={followingThread}
            isSignedIn={!!user}
            variant="thread"
          />
        </div>
      </div>
      <p className="text-sm text-brand-muted mb-8">
        by {threadAuthor} &middot;{' '}
        {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })} &middot;{' '}
        {thread.view_count} views
      </p>

      {/* Original post */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-6 flex gap-4">
        <div className="flex-shrink-0">
          <VoteButton
            threadId={thread.id}
            initialCount={thread.vote_count ?? 0}
            initialVote={myVote === 1 ? 1 : 0}
            isSignedIn={!!user}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-brand-gold/10 text-brand-gold text-xs">{threadInitials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-brand-cream">{threadAuthor}</p>
              <p className="text-xs text-brand-muted">
                {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="text-sm text-brand-cream-muted leading-relaxed whitespace-pre-wrap">
            {thread.content}
          </div>
          <div className="mt-4">
            <PostAttachments attachedRecord={thread.attached_record} images={thread.image_urls} size="full" />
          </div>
        </div>
      </div>

      {/* Replies */}
      {posts && posts.length > 0 && (
        <div className="space-y-4 mb-8">
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            {posts.length} {posts.length === 1 ? 'Reply' : 'Replies'}
          </h2>
          {posts.map((post) => {
            const postProfile = postProfilesMap[post.user_id];
            const postAuthor = postProfile
              ? `${postProfile.first_name || ''} ${postProfile.last_name || ''}`.trim() || 'Anonymous'
              : 'Anonymous';
            const postInitials = postProfile
              ? `${(postProfile.first_name || '')[0] || ''}${(postProfile.last_name || '')[0] || ''}`
              : '?';
            const postReactions = reactions.filter((r) => (r as { post_id: string }).post_id === post.id);

            return (
              <div key={post.id} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-brand-gold/10 text-brand-gold text-xs">{postInitials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-brand-cream">
                      {postAuthor}
                      {post.is_edited && <span className="text-xs text-brand-muted ml-2">(edited)</span>}
                    </p>
                    <p className="text-xs text-brand-muted">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-brand-cream-muted leading-relaxed whitespace-pre-wrap mb-4">
                  {post.content}
                </div>
                <ReactionBar
                  postId={post.id}
                  reactions={postReactions as { id: string; post_id: string; user_id: string; reaction_type: string }[]}
                  currentUserId={user?.id || ''}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Reply editor */}
      {!thread.is_locked && (
        <ReplyEditor threadId={thread.id} isLoggedIn={!!user} />
      )}
      {thread.is_locked && (
        <p className="text-sm text-brand-muted text-center py-6">
          This thread is locked and no longer accepting replies.
        </p>
      )}
    </>
  );
}
