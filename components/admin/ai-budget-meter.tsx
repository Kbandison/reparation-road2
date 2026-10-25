import type { AiBudget } from '@/lib/transcription/types';

export const usd = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;

/**
 * This month's AI spend against the budget: logged spend, plus batches still
 * running at their estimate.
 */
export function AiBudgetMeter({ budget }: { budget: AiBudget }) {
  const pct = (n: number) => (budget.budget > 0 ? Math.min(100, (n / budget.budget) * 100) : 0);
  const spentPct = pct(budget.spent);
  const committedPct = Math.min(100 - spentPct, pct(budget.committed));

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-sm text-brand-cream">
          <span className="font-display text-lg font-semibold">{usd(budget.spent)}</span>
          <span className="text-brand-muted"> of {usd(budget.budget)} AI budget used this month</span>
        </p>
        <p className="text-xs text-brand-muted">
          {usd(budget.remaining)} left
          {budget.committed > 0 && <> · {usd(budget.committed)} held for running batches</>}
        </p>
      </div>
      <div
        className="h-2 rounded-full bg-brand-bg overflow-hidden flex"
        role="progressbar"
        aria-label="AI budget used this month"
        aria-valuenow={Math.round(spentPct + committedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-brand-gold transition-[width] duration-300" style={{ width: `${spentPct}%` }} />
        <div className="h-full bg-brand-gold/40 transition-[width] duration-300" style={{ width: `${committedPct}%` }} />
      </div>
      <p className="text-[11px] text-brand-muted mt-2">Resets on the 1st (UTC).</p>
    </div>
  );
}
