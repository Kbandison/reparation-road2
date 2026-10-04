'use client';

import { CheckCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import type { StorageReferenceSummary } from '@/lib/storage/types';

interface StorageReferenceNoticeProps {
  loading: boolean;
  error: string | null;
  summary: StorageReferenceSummary | null;
  onRetry: () => void;
  /** What happens to the linked records, e.g. "Their links move with it." */
  consequence: string;
  tone: 'info' | 'danger';
}

/** "1,290 records link to files in here" — shown before a rename or delete. */
export function StorageReferenceNotice({ loading, error, summary, onRetry, consequence, tone }: StorageReferenceNoticeProps) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-brand-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Checking which records link here…
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-brand-burgundy-light" role="alert">
        Couldn’t check which records link here: {error}
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-brand-gold hover:text-brand-gold-light">
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  if (!summary) return null;

  if (summary.total === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-brand-sage">
        <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> No collection records link here.
      </p>
    );
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 space-y-1.5 ${
        tone === 'danger' ? 'border-brand-burgundy/30 bg-brand-burgundy/[0.08]' : 'border-brand-gold/25 bg-brand-gold/[0.06]'
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-brand-cream">
        <Link2 className="w-3.5 h-3.5 shrink-0 text-brand-gold" aria-hidden="true" />
        {summary.total.toLocaleString()} record{summary.total === 1 ? '' : 's'} link{summary.total === 1 ? 's' : ''} here
      </p>
      <ul className="space-y-0.5 pl-5 text-[11px] text-brand-muted">
        {summary.sources.map((s) => (
          <li key={s.table} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{s.label}</span>
            <span className="shrink-0 text-brand-cream">{s.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-brand-cream">{consequence}</p>
    </div>
  );
}
