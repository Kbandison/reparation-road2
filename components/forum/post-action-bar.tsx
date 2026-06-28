'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThumbsUp, Lightbulb, HelpCircle, MessageSquare, Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ForumThreadReaction } from '@/lib/types';

interface Props {
  threadId: string;
  threadSlug: string;
  title?: string;
  initialVoteCount: number;
  initialVoted: boolean;
  initialReactions: ForumThreadReaction[];
  currentUserId: string;
  isSignedIn: boolean;
  replyCount: number;
}

// The "rate" reactions a feed post supports. "Like" is handled separately by the
// vote so it keeps driving feed ranking and karma.
const RATINGS = [
  { type: 'helpful', icon: HelpCircle, label: 'Helpful' },
  { type: 'insightful', icon: Lightbulb, label: 'Insightful' },
] as const;

export function PostActionBar({
  threadId,
  threadSlug,
  title,
  initialVoteCount,
  initialVoted,
  initialReactions,
  currentUserId,
  isSignedIn,
  replyCount,
}: Props) {
  const router = useRouter();
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [voted, setVoted] = useState(initialVoted);
  const [votePending, setVotePending] = useState(false);
  const [reactions, setReactions] = useState<ForumThreadReaction[]>(initialReactions);

  async function toggleLike() {
    if (!isSignedIn) {
      router.push('/login');
      return;
    }
    if (votePending) return;
    const next = !voted;
    setVoted(next);
    setVoteCount((c) => c + (next ? 1 : -1));
    setVotePending(true);
    try {
      const res = await fetch('/api/forum/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, value: next ? 1 : 0 }),
      });
      const data = await res.json();
      if (res.ok && typeof data.voteCount === 'number') {
        setVoteCount(data.voteCount);
        setVoted(data.myVote === 1);
      } else {
        setVoted(!next);
        setVoteCount((c) => c + (next ? -1 : 1));
      }
    } catch {
      setVoted(!next);
      setVoteCount((c) => c + (next ? -1 : 1));
    } finally {
      setVotePending(false);
    }
  }

  async function toggleReaction(type: string) {
    if (!isSignedIn) {
      router.push('/login');
      return;
    }
    const supabase = createClient();
    const existing = reactions.find((r) => r.user_id === currentUserId && r.reaction_type === type);

    if (existing) {
      setReactions((prev) => prev.filter((r) => r.id !== existing.id));
      const { error } = await supabase.from('forum_reactions').delete().eq('id', existing.id);
      if (error) setReactions((prev) => [...prev, existing]); // roll back
    } else {
      // Optimistic placeholder until the insert returns the real row.
      const temp: ForumThreadReaction = { id: `temp-${type}`, user_id: currentUserId, reaction_type: type };
      setReactions((prev) => [...prev, temp]);
      const { data, error } = await supabase
        .from('forum_reactions')
        .insert({ thread_id: threadId, user_id: currentUserId, reaction_type: type })
        .select('id, user_id, reaction_type')
        .single();
      if (error || !data) {
        setReactions((prev) => prev.filter((r) => r.id !== temp.id));
      } else {
        setReactions((prev) => prev.map((r) => (r.id === temp.id ? (data as ForumThreadReaction) : r)));
      }
    }
  }

  async function share() {
    const url = `${window.location.origin}/forum/thread/${threadSlug}`;
    const shareData = { title: title || 'A post on Reparation Road', url };
    // Native share sheet on supporting devices; clipboard copy everywhere else.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or it failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Like (vote) */}
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={voted}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          voted
            ? 'bg-brand-gold/10 text-brand-gold'
            : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover',
        )}
      >
        {votePending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ThumbsUp className={cn('w-4 h-4', voted && 'fill-brand-gold')} />
        )}
        Like
        {voteCount > 0 && <span className="tabular-nums">{voteCount}</span>}
      </button>

      {/* Rate */}
      {RATINGS.map(({ type, icon: Icon, label }) => {
        const count = reactions.filter((r) => r.reaction_type === type).length;
        const mine = reactions.some((r) => r.user_id === currentUserId && r.reaction_type === type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggleReaction(type)}
            title={label}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              mine
                ? 'bg-brand-gold/10 text-brand-gold'
                : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover',
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}

      {/* Comment + Share */}
      <div className="flex items-center gap-1 ml-auto">
        <Link
          href={`/forum/thread/${threadSlug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">Comment</span>
          {replyCount > 0 && <span className="tabular-nums">{replyCount}</span>}
        </Link>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>
    </div>
  );
}
