'use client';

import { AlertCircle, Check, CheckCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { baseName } from '@/lib/storage/names';
import type { ImageMatchResult } from '@/lib/import/image-matching';

interface ImportImageMatchesProps {
  /** Distinct image names in the file that still need a file (links already in the file are left out). */
  totalNames: number;
  poolSize: number;
  result: ImageMatchResult;
  /** Near misses the admin confirmed: name → storage path. */
  accepted: Record<string, string>;
  onAccept: (name: string, path: string | null) => void;
  onAcceptAll: () => void;
}

/**
 * The image step's outcome. Exact matches link on their own; near misses wait
 * here for a yes; anything left is listed so it's never imported unnoticed.
 */
export function ImportImageMatches({ totalNames, poolSize, result, accepted, onAccept, onAcceptAll }: ImportImageMatchesProps) {
  const exact = Object.keys(result.exact).length;
  const nearNames = Object.keys(result.near);
  const confirmed = nearNames.filter((n) => accepted[n]).length;
  const linked = exact + confirmed;
  const stillOpen = totalNames - linked;

  if (totalNames === 0) return null;

  if (poolSize === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-brand-gold">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Add the folder that holds the scans to match the file’s {totalNames.toLocaleString()} image name{totalNames === 1 ? '' : 's'}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className={`flex items-center gap-1.5 text-xs ${stillOpen === 0 ? 'text-brand-sage' : 'text-brand-cream'}`} aria-live="polite">
        {stillOpen === 0 ? <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-brand-gold" aria-hidden="true" />}
        {linked.toLocaleString()} of {totalNames.toLocaleString()} image name{totalNames === 1 ? '' : 's'} matched to a file
        {stillOpen > 0 && <span className="text-brand-muted"> · {stillOpen.toLocaleString()} still need one</span>}
      </p>

      {nearNames.length > 0 && (
        <div className="rounded-2xl border border-brand-gold/25 bg-brand-card overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-brand-gold/[0.08] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-1.5 text-xs text-brand-cream">
              <HelpCircle className="w-3.5 h-3.5 mt-px shrink-0 text-brand-gold" aria-hidden="true" />
              <span>
                <span className="font-medium">{nearNames.length} name{nearNames.length === 1 ? ' has' : 's have'} no exact file, only similar ones.</span>{' '}
                <span className="text-brand-muted">Confirm each, or leave it unlinked. Similar names are often the back of a page.</span>
              </span>
            </p>
            {confirmed < nearNames.length && (
              <Button type="button" size="sm" variant="outline" onClick={onAcceptAll} className="h-7 shrink-0 rounded-xl border-brand-gold/25 text-xs text-brand-cream">
                Use first suggestion for all
              </Button>
            )}
          </div>
          <ul className="max-h-64 divide-y divide-brand-gold/[0.04] overflow-y-auto">
            {nearNames.map((name) => (
              <li key={name} className="flex flex-col gap-1.5 px-4 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono text-brand-cream break-all">{name}</span>
                <span className="flex flex-wrap gap-1.5">
                  {result.near[name].map((file) => {
                    const chosen = accepted[name] === file.path;
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => onAccept(name, chosen ? null : file.path)}
                        aria-pressed={chosen}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono transition-colors ${
                          chosen ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                        }`}
                      >
                        {chosen && <Check className="w-3 h-3" aria-hidden="true" />}
                        {baseName(file.path)}
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.unmatched.length > 0 && (
        <details className="rounded-xl border border-brand-gold/[0.08] bg-brand-card px-4 py-2.5 text-xs">
          <summary className="cursor-pointer text-brand-cream">
            {result.unmatched.length} name{result.unmatched.length === 1 ? '' : 's'} with no file in the added folders
          </summary>
          <p className="mt-2 max-h-40 overflow-y-auto font-mono text-[11px] text-brand-muted break-all">
            {result.unmatched.join(' · ')}
          </p>
        </details>
      )}

      {exact > 0 && (
        <details className="rounded-xl border border-brand-gold/[0.08] bg-brand-card px-4 py-2.5 text-xs">
          <summary className="cursor-pointer text-brand-cream">See the {exact.toLocaleString()} exact match{exact === 1 ? '' : 'es'}</summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {Object.entries(result.exact).map(([name, path]) => (
              <li key={name} className="flex items-center justify-between gap-3">
                <span className="truncate text-brand-cream">{name}</span>
                <span className="flex shrink-0 items-center gap-1 text-brand-sage">
                  <CheckCircle className="w-3 h-3" aria-hidden="true" />
                  <span className="max-w-[220px] truncate">{baseName(path)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
