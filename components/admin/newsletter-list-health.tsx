'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Users } from 'lucide-react';

interface Health {
  segments: Record<string, number>;
  labels: Record<string, string>;
  unsubscribed: number;
  cleaned: number;
  pendingConfirmation: number;
  unsynced: number;
}

const card = 'bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6';

/**
 * List health.
 *
 * The counts already existed behind /api/admin/newsletter with nothing showing
 * them, which meant a sync stuck for a week was invisible unless someone
 * thought to query for it. Problems are stated as sentences rather than left as
 * numbers to interpret — a bare "3" next to "unsynced" tells you nothing about
 * whether that is normal.
 */
export function NewsletterListHealth({
  onCounts,
}: {
  /** Lets the composer show how many people a segment actually reaches. */
  onCounts?: (segments: Record<string, number>) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/newsletter');
    if (!res.ok) return;
    const data = await res.json();
    setHealth(data);
    onCounts?.(data.segments ?? {});
  }, [onCounts]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className={card}>
        <Loader2 className="w-4 h-4 animate-spin text-brand-muted" />
      </div>
    );
  }
  if (!health) return null;

  const total = health.segments.all ?? 0;

  // Only genuine problems appear. A panel that always shows three warnings
  // trains people to ignore all three.
  const problems: { text: string; severity: 'warn' | 'info' }[] = [];
  if (health.unsynced > 0) {
    problems.push({
      severity: 'warn',
      text: `${health.unsynced} subscriber${health.unsynced === 1 ? '' : 's'} recorded here but not yet in Resend. The daily reconcile job should clear this; if it persists, that job is not running.`,
    });
  }
  if (health.pendingConfirmation > 0) {
    problems.push({
      severity: 'info',
      text: `${health.pendingConfirmation} signup${health.pendingConfirmation === 1 ? '' : 's'} never confirmed. They receive nothing until they click the link.`,
    });
  }
  if (health.cleaned > 0) {
    problems.push({
      severity: 'info',
      text: `${health.cleaned} address${health.cleaned === 1 ? '' : 'es'} removed after a bounce or spam complaint. These are not unsubscribes and are never mailed again.`,
    });
  }

  return (
    <div className={`${card} mb-6`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-gold" />
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            List health
          </h2>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-cream disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display text-3xl font-semibold text-brand-cream tabular-nums">
          {total.toLocaleString()}
        </span>
        <span className="text-sm text-brand-muted">
          subscriber{total === 1 ? '' : 's'} will receive the next issue
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
        {Object.entries(health.labels)
          .filter(([key]) => key !== 'all')
          .map(([key, label]) => (
            <div key={key} className="flex justify-between gap-3 text-sm">
              <span className="text-brand-muted truncate">{label}</span>
              <span className="text-brand-cream tabular-nums shrink-0">
                {(health.segments[key] ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
      </div>

      <div className="border-t border-brand-gold/[0.08] mt-5 pt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="text-brand-muted">
          Unsubscribed{' '}
          <span className="text-brand-cream tabular-nums">
            {health.unsubscribed.toLocaleString()}
          </span>
        </span>
        <span className="text-brand-muted">
          Removed{' '}
          <span className="text-brand-cream tabular-nums">
            {health.cleaned.toLocaleString()}
          </span>
        </span>
        <span className="text-brand-muted">
          Awaiting confirmation{' '}
          <span className="text-brand-cream tabular-nums">
            {health.pendingConfirmation.toLocaleString()}
          </span>
        </span>
      </div>

      {problems.length > 0 && (
        <div className="mt-4 space-y-2">
          {problems.map((p) => (
            <p
              key={p.text}
              className={`flex items-start gap-2 text-xs leading-relaxed ${
                p.severity === 'warn' ? 'text-brand-burgundy-light' : 'text-brand-muted'
              }`}
            >
              {p.severity === 'warn' && (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              )}
              <span>{p.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
