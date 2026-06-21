'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowBigUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoteButtonProps {
  threadId: string;
  initialCount: number;
  initialVote: number; // 0 | 1
  isSignedIn: boolean;
  orientation?: 'vertical' | 'horizontal';
}

export function VoteButton({
  threadId,
  initialCount,
  initialVote,
  isSignedIn,
  orientation = 'vertical',
}: VoteButtonProps) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVote === 1);
  const [pending, setPending] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      router.push('/login');
      return;
    }
    if (pending) return;

    // Optimistic update.
    const nextVoted = !voted;
    setVoted(nextVoted);
    setCount((c) => c + (nextVoted ? 1 : -1));
    setPending(true);

    try {
      const res = await fetch('/api/forum/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, value: nextVoted ? 1 : 0 }),
      });
      const data = await res.json();
      if (res.ok && typeof data.voteCount === 'number') {
        setCount(data.voteCount);
        setVoted(data.myVote === 1);
      } else {
        // Roll back on failure.
        setVoted(voted);
        setCount(initialCountFrom(count, voted, nextVoted));
      }
    } catch {
      setVoted(voted);
      setCount(initialCountFrom(count, voted, nextVoted));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        'flex items-center select-none',
        orientation === 'vertical' ? 'flex-col gap-0.5' : 'flex-row gap-1.5',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={voted}
        aria-label="Upvote"
        className={cn(
          'rounded-lg p-1 transition-colors',
          voted ? 'text-brand-gold' : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover',
        )}
      >
        <ArrowBigUp className={cn('w-5 h-5', voted && 'fill-brand-gold')} />
      </button>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          voted ? 'text-brand-gold' : 'text-brand-cream',
        )}
      >
        {count}
      </span>
    </div>
  );
}

// Recompute the count when rolling back a failed optimistic toggle.
function initialCountFrom(current: number, prevVoted: boolean, attempted: boolean): number {
  // Undo the optimistic delta we applied.
  return current - (attempted ? 1 : -1);
}
