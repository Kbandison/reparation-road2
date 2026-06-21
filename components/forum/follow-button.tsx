'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  targetType: 'thread' | 'user' | 'surname';
  targetId: string;
  initialFollowing: boolean;
  isSignedIn: boolean;
  variant?: 'thread' | 'user';
}

export function FollowButton({ targetType, targetId, initialFollowing, isSignedIn, variant = 'user' }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!isSignedIn) {
      router.push('/login');
      return;
    }
    if (pending) return;
    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      const res = await fetch('/api/forum/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });
      const data = await res.json();
      if (res.ok) setFollowing(!!data.following);
      else setFollowing(!next);
    } catch {
      setFollowing(!next);
    } finally {
      setPending(false);
    }
  }

  const Icon = pending
    ? Loader2
    : variant === 'thread'
      ? following ? BellRing : Bell
      : following ? UserCheck : UserPlus;

  const label = variant === 'thread'
    ? following ? 'Following' : 'Follow thread'
    : following ? 'Following' : 'Follow';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={cn(
        'rounded-xl border-brand-gold/20',
        following ? 'text-brand-gold border-brand-gold/40' : 'text-brand-cream',
      )}
    >
      <Icon className={cn('w-3.5 h-3.5 mr-1.5', pending && 'animate-spin')} />
      {label}
    </Button>
  );
}
