'use client';

import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildImageUrl } from '@/lib/collections/helpers';
import { MODEL_LABELS } from '@/lib/ai/models';
import type { TrialRow } from '@/lib/transcription/types';

interface TrialCompareProps {
  trials: TrialRow[];
  models: string[];
  /** The model batches currently use. */
  activeModel: string;
  collectionNames: Map<string, string>;
  onUseModel: (model: string) => void;
  savingModel: string | null;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-brand-sage/15 text-brand-sage',
  medium: 'bg-brand-gold/15 text-brand-gold',
  low: 'bg-brand-burgundy/20 text-brand-burgundy-light',
};

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** The pilot's scans side by side: the page, then each model's reading of it. */
export function TrialCompare({ trials, models, activeModel, collectionNames, onUseModel, savingModel }: TrialCompareProps) {
  const byScan = new Map<string, { collection: string | null; results: Map<string, TrialRow> }>();
  for (const t of trials) {
    const entry = byScan.get(t.image_key) ?? { collection: t.collection_slug, results: new Map() };
    entry.results.set(t.model, t);
    byScan.set(t.image_key, entry);
  }

  const stats = models.map((model) => {
    const rows = trials.filter((t) => t.model === model);
    const ok = rows.filter((t) => !t.error);
    return {
      model,
      done: rows.length,
      failed: rows.length - ok.length,
      cost: average(ok.map((t) => Number(t.cost_usd ?? 0))),
      seconds: average(ok.map((t) => (t.duration_ms ?? 0) / 1000)),
      low: ok.filter((t) => t.confidence === 'low').length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Per-model summary */}
      <div className={`grid gap-3 ${models.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {stats.map((s) => (
          <div key={s.model} className="bg-brand-bg border border-brand-gold/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="font-display text-base font-semibold text-brand-cream">{MODEL_LABELS[s.model] ?? s.model}</p>
              {s.model === activeModel ? (
                <span className="flex items-center gap-1 text-xs text-brand-sage">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Used for batches
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUseModel(s.model)}
                  disabled={savingModel !== null}
                  className="h-7 rounded-xl border-brand-gold/20 text-brand-gold text-xs"
                >
                  {savingModel === s.model ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : 'Use for batches'}
                </Button>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-brand-muted">Per page</dt>
                <dd className="text-brand-cream font-medium">${s.cost.toFixed(3)}</dd>
                <dd className="text-[10px] text-brand-muted">${(s.cost / 2).toFixed(3)} in a batch</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Time</dt>
                <dd className="text-brand-cream font-medium">{s.seconds.toFixed(0)}s</dd>
              </div>
              <div>
                <dt className="text-brand-muted">Low confidence</dt>
                <dd className="text-brand-cream font-medium">
                  {s.low} of {s.done - s.failed}
                  {s.failed > 0 && <span className="text-brand-burgundy-light"> · {s.failed} failed</span>}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* Each scan */}
      {[...byScan.entries()].map(([key, entry]) => {
        const full = buildImageUrl(key);
        const thumb = buildImageUrl(key, { width: 700 });
        return (
          <article key={key} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <p className="text-sm text-brand-cream font-medium break-all">{key.split('/').pop()}</p>
              {entry.collection && (
                <p className="text-xs text-brand-muted">{collectionNames.get(entry.collection) ?? entry.collection}</p>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <a href={full ?? '#'} target="_blank" rel="noreferrer" className="block group relative self-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- archival scans come from the Supabase transform endpoint, not next/image */}
                <img
                  src={thumb ?? ''}
                  alt={`Scan ${key.split('/').pop()}`}
                  loading="lazy"
                  className="w-full rounded-xl border border-brand-gold/[0.08] bg-brand-bg"
                />
                <span className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3" aria-hidden="true" /> Full size
                </span>
              </a>
              <div className={`grid gap-3 ${models.length > 1 ? 'xl:grid-cols-2' : ''}`}>
                {models.map((model) => {
                  const t = entry.results.get(model);
                  return (
                    <div key={model} className="min-w-0 bg-brand-bg border border-brand-gold/[0.08] rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-brand-cream">{MODEL_LABELS[model] ?? model}</p>
                        {t?.confidence && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${CONFIDENCE_STYLE[t.confidence]}`}>{t.confidence}</span>
                        )}
                      </div>
                      {!t ? (
                        <p className="text-xs text-brand-muted flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Waiting…
                        </p>
                      ) : t.error ? (
                        <p className="text-xs text-brand-burgundy-light" role="alert">{t.error}</p>
                      ) : (
                        <>
                          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-brand-cream">
                            {t.text || '(blank page)'}
                          </pre>
                          {t.notes && <p className="mt-2 text-[11px] text-brand-muted italic">{t.notes}</p>}
                          <p className="mt-2 text-[10px] text-brand-muted">
                            ${Number(t.cost_usd ?? 0).toFixed(3)} · {((t.duration_ms ?? 0) / 1000).toFixed(0)}s · {t.output_tokens?.toLocaleString()} tokens out
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
