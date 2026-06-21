import Link from 'next/link';
import { MessageSquare, Pin, Lock, Search, HelpCircle, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { VoteButton } from './vote-button';
import { Avatar } from './avatar';
import type { FeedItem, ForumPostType } from '@/lib/types';

const POST_TYPE_META: Record<ForumPostType, { label: string; icon: typeof Search; cls: string }> = {
  discussion: { label: 'Discussion', icon: MessageSquare, cls: 'text-brand-muted' },
  find: { label: 'Share a Find', icon: Search, cls: 'text-brand-gold' },
  help: { label: 'Research Help', icon: HelpCircle, cls: 'text-brand-sage' },
};

function snippet(content: string, max = 180): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function PostCard({ item, isSignedIn }: { item: FeedItem; isSignedIn: boolean }) {
  const { thread, author, categoryName, categorySlug, replyCount, voteCount, myVote } = item;
  const type = (thread.post_type ?? 'discussion') as ForumPostType;
  const typeMeta = POST_TYPE_META[type] ?? POST_TYPE_META.discussion;
  const TypeIcon = typeMeta.icon;
  const images = thread.image_urls ?? [];

  return (
    <div className="flex gap-3 bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-3 sm:p-4 hover:border-brand-gold/20 transition-colors">
      {/* Vote rail */}
      <div className="flex-shrink-0 pt-0.5">
        <VoteButton
          threadId={thread.id}
          initialCount={voteCount}
          initialVote={myVote === 1 ? 1 : 0}
          isSignedIn={isSignedIn}
        />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-brand-muted mb-1">
          {categorySlug ? (
            <Link
              href={`/forum?category=${categorySlug}`}
              className="font-medium text-brand-cream hover:text-brand-gold transition-colors"
            >
              {categoryName}
            </Link>
          ) : (
            <span className="font-medium text-brand-cream">{categoryName}</span>
          )}
          <span>·</span>
          <span className={`inline-flex items-center gap-1 ${typeMeta.cls}`}>
            <TypeIcon className="w-3 h-3" />
            {typeMeta.label}
          </span>
          {thread.is_pinned && <Pin className="w-3 h-3 text-brand-gold" />}
          {thread.is_locked && <Lock className="w-3 h-3 text-brand-muted" />}
        </div>

        {/* Title */}
        <Link href={`/forum/thread/${thread.slug}`} className="group block">
          <h3 className="font-display text-base sm:text-lg font-semibold text-brand-cream group-hover:text-brand-gold transition-colors leading-snug">
            {thread.title}
          </h3>
        </Link>

        {/* Snippet */}
        {thread.content && (
          <p className="text-sm text-brand-muted mt-1 line-clamp-2">{snippet(thread.content)}</p>
        )}

        {/* Attached record (Share-a-Find hook) */}
        {thread.attached_record && (
          <Link
            href={`/collection/${thread.attached_record.collection_slug}?record=${encodeURIComponent(thread.attached_record.record_id)}`}
            className="inline-flex items-center gap-2 mt-2 rounded-xl border border-brand-gold/20 bg-brand-bg/50 px-3 py-2 hover:border-brand-gold/40 transition-colors"
          >
            <FileText className="w-4 h-4 text-brand-gold shrink-0" />
            <span className="text-xs text-brand-cream truncate">{thread.attached_record.title}</span>
          </Link>
        )}

        {/* Image thumbnails */}
        {images.length > 0 && (
          <div className="flex gap-2 mt-2">
            {images.slice(0, 4).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="w-16 h-16 rounded-lg object-cover border border-brand-gold/10"
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 mt-2.5 text-xs text-brand-muted">
          <Link
            href={author.handle ? `/forum/u/${author.handle}` : '#'}
            className="inline-flex items-center gap-1.5 hover:text-brand-cream transition-colors"
          >
            <Avatar name={author.displayName} src={author.avatarUrl} size={20} />
            <span>{author.displayName}</span>
          </Link>
          <span>·</span>
          <span>{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
          <Link
            href={`/forum/thread/${thread.slug}`}
            className="inline-flex items-center gap-1 hover:text-brand-cream transition-colors ml-auto"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {replyCount}
          </Link>
        </div>
      </div>
    </div>
  );
}
