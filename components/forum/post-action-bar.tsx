'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThumbsUp, Lightbulb, HelpCircle, MessageSquare, Share2, Link2, Repeat2, Send, Loader2 } from 'lucide-react';
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

const BTN =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors';
const BTN_IDLE = 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover';
const BTN_ON = 'bg-brand-gold/10 text-brand-gold';

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

  const [shareOpen, setShareOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Close the share menu on an outside click.
  useEffect(() => {
    if (!shareOpen) return;
    function onClick(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [shareOpen]);

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

  function threadUrl() {
    return `${window.location.origin}/forum/thread/${threadSlug}`;
  }

  async function copyLink() {
    setShareOpen(false);
    try {
      await navigator.clipboard.writeText(threadUrl());
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  async function nativeShare() {
    setShareOpen(false);
    try {
      await navigator.share({ title: title || 'A post on Reparation Road', url: threadUrl() });
    } catch {
      // cancelled — ignore
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Like (vote) */}
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={voted}
        className={cn(BTN, voted ? BTN_ON : BTN_IDLE)}
      >
        {votePending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ThumbsUp className={cn('w-4 h-4', voted && 'fill-brand-gold')} />
        )}
        Like
        {voteCount > 0 && <span className="tabular-nums">{voteCount}</span>}
      </button>

      {/* Comment */}
      <Link href={`/forum/thread/${threadSlug}`} className={cn(BTN, BTN_IDLE)}>
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">Comment</span>
        {replyCount > 0 && <span className="tabular-nums">{replyCount}</span>}
      </Link>

      {/* Share (menu: internal repost + copy link + native) */}
      <div className="relative" ref={shareRef}>
        <button
          type="button"
          onClick={() => setShareOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={shareOpen}
          className={cn(BTN, shareOpen ? BTN_ON : BTN_IDLE)}
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>

        {shareOpen && (
          <div
            role="menu"
            className="absolute left-0 bottom-full mb-2 z-30 w-52 rounded-xl border border-brand-gold/15 bg-brand-card shadow-2xl py-1"
          >
            <Link
              href={`/forum/new?share=${encodeURIComponent(threadSlug)}`}
              onClick={() => setShareOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-brand-cream hover:bg-brand-card-hover transition-colors"
            >
              <Repeat2 className="w-4 h-4 text-brand-gold" />
              Share to your feed
            </Link>
            <button
              type="button"
              onClick={copyLink}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-brand-cream hover:bg-brand-card-hover transition-colors"
            >
              <Link2 className="w-4 h-4 text-brand-muted" />
              Copy link
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-brand-cream hover:bg-brand-card-hover transition-colors"
              >
                <Send className="w-4 h-4 text-brand-muted" />
                Share via…
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rate */}
      <div className="flex items-center gap-1 ml-auto">
        {RATINGS.map(({ type, icon: Icon, label }) => {
          const count = reactions.filter((r) => r.reaction_type === type).length;
          const mine = reactions.some((r) => r.user_id === currentUserId && r.reaction_type === type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleReaction(type)}
              title={label}
              className={cn(BTN, mine ? BTN_ON : BTN_IDLE)}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
