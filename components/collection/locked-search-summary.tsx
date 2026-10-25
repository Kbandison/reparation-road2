'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Lock } from 'lucide-react';

interface LockedGroup {
  collectionSlug: string;
  collectionName: string;
  parentName: string | null;
  total: number;
}

interface LockedSearchSummaryProps {
  groups: LockedGroup[];
  /** Why the viewer can't see the records: not signed in, or signed in without a membership. */
  reason: 'login' | 'subscribe';
}

/**
 * Every members-only collection with matches the viewer can't open, as one
 * card after the open results: how many records match where, without any of
 * their data, and how to get access.
 */
export function LockedSearchSummary({ groups, reason }: LockedSearchSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.total, 0);
  const collections = `${groups.length.toLocaleString()} members-only collection${groups.length === 1 ? '' : 's'}`;

  return (
    <div className="bg-brand-card border border-brand-gold/[0.15] rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Lock className="w-5 h-5 text-brand-gold flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-display text-base font-semibold text-brand-cream">
              {total.toLocaleString()} more matching record{total === 1 ? '' : 's'} in {collections}
            </p>
            <p className="text-sm text-brand-muted mt-1">
              {reason === 'login'
                ? 'Sign in or create an account, then become a member to see them.'
                : 'Become a member to see them.'}
            </p>
          </div>
        </div>
        <Link
          href={reason === 'login' ? `/login?redirect=${encodeURIComponent('/membership')}` : '/membership'}
          className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light transition-colors whitespace-nowrap"
        >
          {reason === 'login' ? 'Sign in' : 'View membership'}
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="mt-4 flex items-center gap-1.5 text-xs text-brand-gold hover:text-brand-gold-light transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        {expanded ? 'Hide' : 'Show'} where they are
      </button>

      {expanded && (
        <ul id={listId} className="mt-3 divide-y divide-brand-gold/[0.06] border-t border-brand-gold/[0.08]">
          {groups.map((g) => (
            <li key={g.collectionSlug} className="flex items-baseline justify-between gap-3 py-2">
              <Link
                href={`/collection/${g.collectionSlug}`}
                className="min-w-0 text-sm text-brand-cream hover:text-brand-gold transition-colors"
              >
                {g.collectionName}
                {g.parentName && <span className="text-xs text-brand-muted ml-2">in {g.parentName}</span>}
              </Link>
              <span className="text-xs text-brand-muted whitespace-nowrap flex-shrink-0">
                {g.total.toLocaleString()} match{g.total === 1 ? '' : 'es'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
