'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchApi } from '@/lib/import/http';
import type { ScanCounts, TranscriptionOverview } from '@/lib/transcription/types';

interface BatchPanelProps {
  overview: TranscriptionOverview;
  onStarted: () => void;
}

/** Sends a whole collection's untranscribed pages to the Batch API at half price. */
export function BatchPanel({ overview, onStarted }: BatchPanelProps) {
  const [slug, setSlug] = useState('');
  const [counts, setCounts] = useState<ScanCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeOcr, setIncludeOcr] = useState(false);
  const [starting, setStarting] = useState(false);
  // This batch's model: the pilot's pick unless the admin chooses another (e.g.
  // Opus for hard handwriting, Sonnet for clear typed records).
  const [modelPick, setModelPick] = useState<string | null>(null);

  // The collection whose counts are wanted now, so a slow answer for an
  // earlier pick can't overwrite a later one.
  const wanted = useRef('');

  const choose = async (next: string) => {
    wanted.current = next;
    setSlug(next);
    setCounts(null);
    setIncludeOcr(false);
    if (!next) return;
    setLoading(true);
    const { ok, data } = await fetchApi(`/api/admin/transcription?action=scans&collection=${encodeURIComponent(next)}`);
    if (wanted.current !== next) return;
    setLoading(false);
    if (ok) setCounts(data as unknown as ScanCounts);
    else toast.error(data.error);
  };

  const model = modelPick ?? overview.model;
  const perScan = overview.perScan[model];
  const pages = counts ? (includeOcr ? counts.toDoWithOcr : counts.toDo) : 0;
  const estimate = pages * (perScan?.usd ?? 0);
  const overBudget = estimate > overview.budget.remaining;
  const ocrOnly = counts ? counts.toDoWithOcr - counts.toDo : 0;

  const start = async () => {
    setStarting(true);
    const { ok, data } = await fetchApi('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', collection: slug, includeOcr, model }),
    });
    setStarting(false);
    if (!ok) {
      toast.error(data.error);
      return;
    }
    toast.success(`Sent ${pages.toLocaleString()} pages to Claude. Results usually arrive within the hour.`);
    void choose('');
    onStarted();
  };

  return (
    <section className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-brand-cream flex items-center gap-2">
          <Layers className="w-5 h-5 text-brand-gold" aria-hidden="true" /> Transcribe a collection
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          Runs through Anthropic&apos;s Batch API at half price. Most batches finish within an hour; you can leave this
          page and come back.
        </p>
      </div>

      <label className="block text-xs text-brand-muted">
        Collection
        <select
          value={slug}
          onChange={(e) => void choose(e.target.value)}
          className="mt-1 w-full rounded-xl bg-brand-bg border border-brand-gold/[0.12] px-3 py-2.5 text-sm text-brand-cream"
        >
          <option value="">Choose a collection…</option>
          {overview.collections.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
              {c.parentName ? ` (${c.parentName})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-brand-muted">
        Model
        <select
          value={model}
          onChange={(e) => setModelPick(e.target.value === overview.model ? null : e.target.value)}
          className="mt-1 w-full rounded-xl bg-brand-bg border border-brand-gold/[0.12] px-3 py-2.5 text-sm text-brand-cream"
        >
          {overview.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · about ${(overview.perScan[m.id]?.usd ?? 0).toFixed(3)} a page
              {m.id === overview.model ? ' (chosen in the pilot)' : ''}
            </option>
          ))}
        </select>
      </label>

      {loading && (
        <p className="text-sm text-brand-muted flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Counting pages…
        </p>
      )}

      {counts && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ['Scanned pages', counts.total],
              ['Transcribed', counts.transcribed],
              ['Have OCR text', counts.withOcr],
              ['Left to do', counts.toDo],
            ].map(([label, value]) => (
              <div key={label} className="bg-brand-bg rounded-xl p-3">
                <dt className="text-[11px] text-brand-muted">{label}</dt>
                <dd className="font-display text-lg text-brand-cream">{Number(value).toLocaleString()}</dd>
              </div>
            ))}
          </dl>

          {counts.recordsWithoutScan > 0 && (
            <p className="text-[11px] text-brand-muted">
              {counts.recordsWithoutScan.toLocaleString()} records have no scan Claude can read (no image, a PDF, the
              placeholder, or a file name without a storage folder).
            </p>
          )}

          {ocrOnly > 0 && (
            <label className="flex items-start gap-3 rounded-xl border border-brand-gold/[0.12] p-3 cursor-pointer">
              <Checkbox checked={includeOcr} onCheckedChange={(v) => setIncludeOcr(v === true)} className="mt-0.5" />
              <span className="text-sm text-brand-cream">
                Also redo the {ocrOnly.toLocaleString()} pages that already have OCR text
                <span className="block text-xs text-brand-muted mt-0.5">
                  Their existing OCR text stays on the records; the transcript is added alongside it.
                </span>
              </span>
            </label>
          )}

          {pages === 0 ? (
            <p className="text-sm text-brand-sage">Nothing left to transcribe here.</p>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                onClick={start}
                disabled={starting || overBudget}
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
                Transcribe {pages.toLocaleString()} pages · about ${estimate.toFixed(2)}
              </Button>
              <p className={`text-xs ${overBudget ? 'text-brand-burgundy-light' : 'text-brand-muted'}`}>
                {overBudget
                  ? `That's more than the $${overview.budget.remaining.toFixed(2)} left this month.`
                  : perScan?.measured
                    ? 'Estimate based on the pilot.'
                    : 'Rough estimate until a pilot has run.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
