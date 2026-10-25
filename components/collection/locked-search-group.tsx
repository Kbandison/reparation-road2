import Link from 'next/link';
import { Lock } from 'lucide-react';

interface LockedSearchGroupProps {
  collectionSlug: string;
  collectionName: string;
  parentName: string | null;
  total: number;
  /** Why the viewer can't see the records: not signed in, or signed in without a membership. */
  reason: 'login' | 'subscribe';
}

/**
 * A search result group from a members-only collection the viewer can't open:
 * how many records match, without any of their data, and how to get access.
 */
export function LockedSearchGroup({ collectionSlug, collectionName, parentName, total, reason }: LockedSearchGroupProps) {
  const matches = `${total.toLocaleString()} matching record${total === 1 ? '' : 's'}`;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-brand-gold/[0.08] pb-2">
        <div className="min-w-0">
          <Link
            href={`/collection/${collectionSlug}`}
            className="font-display text-sm font-semibold text-brand-cream hover:text-brand-gold transition-colors"
          >
            {collectionName}
          </Link>
          {parentName && <span className="text-xs text-brand-muted ml-2">in {parentName}</span>}
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold whitespace-nowrap flex-shrink-0">
          Members only
        </span>
      </div>

      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <Lock className="w-5 h-5 text-brand-gold flex-shrink-0" aria-hidden="true" />
        <p className="text-sm text-brand-muted flex-1">
          <span className="text-brand-cream font-medium">{matches}</span>{' '}
          {reason === 'login'
            ? 'in this members-only collection. Sign in or create an account, then become a member to see them.'
            : 'in this members-only collection. Become a member to see them.'}
        </p>
        <Link
          href={reason === 'login' ? `/login?redirect=${encodeURIComponent(`/collection/${collectionSlug}`)}` : '/membership'}
          className="inline-flex items-center justify-center px-4 py-2 text-xs font-medium rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light transition-colors whitespace-nowrap"
        >
          {reason === 'login' ? 'Sign in' : 'View membership'}
        </Link>
      </div>
    </div>
  );
}
