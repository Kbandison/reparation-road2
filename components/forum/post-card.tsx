import Link from 'next/link';
import { MessageSquare, Pin, Lock, Search, HelpCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from './avatar';
import { PostMedia, AttachedRecordCard } from './post-media';
import { PostActionBar } from './post-action-bar';
import type { FeedItem, ForumPostType } from '@/lib/types';

const POST_TYPE_META: Record<ForumPostType, { label: string; icon: typeof Search; cls: string }> = {
  discussion: { label: 'Discussion', icon: MessageSquare, cls: 'text-brand-muted' },
  find: { label: 'Share a Find', icon: Search, cls: 'text-brand-gold' },
  help: { label: 'Research Help', icon: HelpCircle, cls: 'text-brand-sage' },
};

function snippet(content: string, max = 280): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function PostCard({
  item,
  isSignedIn,
  currentUserId = '',
}: {
  item: FeedItem;
  isSignedIn: boolean;
  currentUserId?: string;
}) {
  const { thread, author, categoryName, categorySlug, replyCount, voteCount, myVote, reactions } = item;
  const type = (thread.post_type ?? 'discussion') as ForumPostType;
  const typeMeta = POST_TYPE_META[type] ?? POST_TYPE_META.discussion;
  const TypeIcon = typeMeta.icon;
  const images = thread.image_urls ?? [];

  return (
    <article className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 hover:border-brand-gold/20 transition-colors">
      {/* Author header */}
      <div className="flex items-center gap-2.5">
        <Link href={author.handle ? `/forum/u/${author.handle}` : '#'} className="shrink-0">
          <Avatar name={author.displayName} src={author.avatarUrl} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={author.handle ? `/forum/u/${author.handle}` : '#'}
              className="text-sm font-semibold text-brand-cream hover:text-brand-gold transition-colors truncate"
            >
              {author.displayName}
            </Link>
            {author.handle && <span className="text-xs text-brand-muted truncate">@{author.handle}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-brand-muted flex-wrap">
            {categorySlug ? (
              <Link href={`/forum?category=${categorySlug}`} className="hover:text-brand-gold transition-colors">
                {categoryName}
              </Link>
            ) : (
              <span>{categoryName}</span>
            )}
            <span>·</span>
            <span>{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
            <span>·</span>
            <span className={`inline-flex items-center gap-1 ${typeMeta.cls}`}>
              <TypeIcon className="w-3 h-3" />
              {typeMeta.label}
            </span>
            {thread.is_pinned && <Pin className="w-3 h-3 text-brand-gold" />}
            {thread.is_locked && <Lock className="w-3 h-3 text-brand-muted" />}
          </div>
        </div>
      </div>

      {/* Title + body */}
      <div className="mt-3">
        <Link href={`/forum/thread/${thread.slug}`} className="group block">
          <h3 className="font-display text-lg sm:text-xl font-semibold text-brand-cream group-hover:text-brand-gold transition-colors leading-snug">
            {thread.title}
          </h3>
        </Link>
        {thread.content && (
          <p className="text-sm text-brand-cream-muted mt-1.5 leading-relaxed line-clamp-4 whitespace-pre-wrap">
            {snippet(thread.content)}
          </p>
        )}
      </div>

      {/* Large media */}
      {images.length > 0 && (
        <div className="mt-3">
          <PostMedia images={images} href={`/forum/thread/${thread.slug}`} />
        </div>
      )}

      {/* Attached archive record (at the bottom of the content) */}
      {thread.attached_record && (
        <div className="mt-3">
          <AttachedRecordCard record={thread.attached_record} />
        </div>
      )}

      {/* Like / rate / comment */}
      <div className="mt-3 pt-3 border-t border-brand-gold/[0.06]">
        <PostActionBar
          threadId={thread.id}
          threadSlug={thread.slug}
          initialVoteCount={voteCount}
          initialVoted={myVote === 1}
          initialReactions={reactions}
          currentUserId={currentUserId}
          isSignedIn={isSignedIn}
          replyCount={replyCount}
        />
      </div>
    </article>
  );
}
