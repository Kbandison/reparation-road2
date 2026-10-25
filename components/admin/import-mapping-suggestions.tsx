import { CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type SuggestStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ImportMappingSuggestionsProps {
  status: SuggestStatus;
  /** Headers where Claude's target differs from the current mapping. */
  differing: number;
  onApplyAll: () => void;
}

/** The Mapping step's line about Claude's suggestions: still thinking, agrees, or differs (with Apply all). */
export function ImportMappingSuggestions({ status, differing, onApplyAll }: ImportMappingSuggestionsProps) {
  if (status === 'idle' || status === 'failed') return null;

  if (status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-xs text-brand-muted" aria-live="polite">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" aria-hidden="true" />
        Claude is checking these matches…
      </p>
    );
  }

  if (differing === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-brand-sage" aria-live="polite">
        <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Claude agrees with these matches.
      </p>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3" aria-live="polite">
      <p className="flex-1 flex items-start gap-2 text-xs text-brand-cream">
        <Sparkles className="w-4 h-4 text-brand-gold mt-px shrink-0" aria-hidden="true" />
        Claude suggests different matches for {differing} column{differing === 1 ? '' : 's'}. They&apos;re shown under
        each one; nothing changes until you accept them.
      </p>
      <Button onClick={onApplyAll} size="sm" className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light text-xs h-8 shrink-0">
        Apply all
      </Button>
    </div>
  );
}

interface SuggestedTargetProps {
  target: string;
  reason: string;
  onAccept: () => void;
}

/** Under one column's dropdown: Claude's pick, why, and a button to take it. */
export function SuggestedTarget({ target, reason, onAccept }: SuggestedTargetProps) {
  return (
    <button
      type="button"
      onClick={onAccept}
      title={reason}
      className="mt-1 flex w-full items-start gap-1 text-left text-[11px] text-brand-gold hover:text-brand-gold-light"
    >
      <Sparkles className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
      <span>
        Suggested: <span className="font-mono">{target || 'Skip'}</span>
        {reason && <span className="text-brand-muted"> · {reason}</span>}
      </span>
    </button>
  );
}
