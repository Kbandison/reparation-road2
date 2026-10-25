'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { fetchApi } from '@/lib/import/http';
import { MODEL_LABELS } from '@/lib/ai/models';
import type { TranscriptionOverview, TrialRow } from '@/lib/transcription/types';
import { TrialCompare } from './trial-compare';

const MAX_COLLECTIONS = 8;
/** Pages transcribed at once: enough to finish a pilot in minutes, gentle on rate limits. */
const CONCURRENCY = 3;

interface PilotPanelProps {
  overview: TranscriptionOverview;
  onModelChange: (model: string) => void;
  /** Called when a pilot finishes, so the budget and estimates refresh. */
  onFinished: () => void;
}

/** Runs the same handful of pages through each model so the results can be compared before a big batch. */
export function PilotPanel({ overview, onModelChange, onFinished }: PilotPanelProps) {
  const models = overview.models.map((m) => m.id);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [perCollection, setPerCollection] = useState(4);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [trials, setTrials] = useState<TrialRow[]>([]);
  const [savingModel, setSavingModel] = useState<string | null>(null);

  // The most recent pilot, so its results survive a reload.
  useEffect(() => {
    void fetchApi('/api/admin/transcription?action=trials').then(({ ok, data }) => {
      if (ok && Array.isArray(data.trials)) setTrials(data.trials as TrialRow[]);
    });
  }, []);

  const collectionNames = useMemo(() => new Map(overview.collections.map((c) => [c.slug, c.name])), [overview.collections]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return overview.collections.filter((c) => !q || `${c.name} ${c.parentName ?? ''}`.toLowerCase().includes(q));
  }, [overview.collections, filter]);

  // Trials run at full price; perScan is the half-price batch figure.
  const pages = selected.length * perCollection;
  const estimate = pages * models.reduce((sum, m) => sum + (overview.perScan[m]?.usd ?? 0) * 2, 0);

  const toggle = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length < MAX_COLLECTIONS ? [...prev, slug] : prev,
    );

  const run = async () => {
    setRunning(true);
    const sample = await fetchApi('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pilot-sample', collections: selected, perCollection }),
    });
    if (!sample.ok) {
      toast.error(sample.data.error);
      setRunning(false);
      return;
    }
    const runId = sample.data.runId as string;
    const items = sample.data.items as { imageKey: string; collectionSlug: string }[];
    const tasks = items.flatMap((item) => models.map((model) => ({ ...item, model })));
    setTrials([]);
    setProgress({ done: 0, total: tasks.length });

    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        const res = await fetchApi('/api/admin/transcription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pilot-one', runId, ...task }),
        });
        const d = res.data;
        const row: TrialRow = res.ok
          ? {
              id: String(d.id),
              image_key: task.imageKey,
              collection_slug: task.collectionSlug,
              model: task.model,
              text: (d.transcript as { text?: string } | null)?.text ?? null,
              confidence: (d.transcript as { confidence?: TrialRow['confidence'] } | null)?.confidence ?? null,
              notes: (d.transcript as { notes?: string } | null)?.notes ?? null,
              error: (d.error as string | null) ?? null,
              input_tokens: null,
              output_tokens: null,
              cost_usd: Number(d.costUsd ?? 0),
              duration_ms: Number(d.durationMs ?? 0),
              created_at: new Date().toISOString(),
            }
          : {
              id: `${task.imageKey}-${task.model}`,
              image_key: task.imageKey,
              collection_slug: task.collectionSlug,
              model: task.model,
              text: null,
              confidence: null,
              notes: null,
              error: d.error ?? 'Failed',
              input_tokens: null,
              output_tokens: null,
              cost_usd: 0,
              duration_ms: 0,
              created_at: new Date().toISOString(),
            };
        setTrials((prev) => [...prev, row]);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));

    // Reload from the server for the token counts.
    const saved = await fetchApi(`/api/admin/transcription?action=trials&run=${runId}`);
    if (saved.ok && Array.isArray(saved.data.trials)) setTrials(saved.data.trials as TrialRow[]);
    setRunning(false);
    onFinished();
    toast.success('Pilot finished');
  };

  const useModel = async (model: string) => {
    setSavingModel(model);
    const { ok, data } = await fetchApi('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-model', model }),
    });
    setSavingModel(null);
    if (!ok) {
      toast.error(data.error);
      return;
    }
    onModelChange(model);
    toast.success(`Batches will use ${MODEL_LABELS[model] ?? model}`);
  };

  return (
    <section className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-brand-cream flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-brand-gold" aria-hidden="true" /> Pilot
        </h2>
        <p className="text-sm text-brand-muted mt-1">
          Run a few pages from different collections through {models.map((m) => MODEL_LABELS[m] ?? m).join(' and ')}, compare
          the readings, then choose the model for full batches.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" aria-hidden="true" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a collection"
              aria-label="Find a collection"
              className="pl-9 rounded-xl"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto rounded-xl border border-brand-gold/[0.08] divide-y divide-brand-gold/[0.06]">
            {visible.map((c) => {
              const checked = selected.includes(c.slug);
              const id = `pilot-${c.slug}`;
              return (
                <li key={c.slug} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={running || (!checked && selected.length >= MAX_COLLECTIONS)}
                    onCheckedChange={() => toggle(c.slug)}
                  />
                  <label htmlFor={id} className="flex-1 min-w-0 text-sm text-brand-cream cursor-pointer">
                    {c.name}
                    {c.parentName && <span className="text-xs text-brand-muted ml-2">in {c.parentName}</span>}
                  </label>
                  {c.transcribed > 0 && <span className="text-[11px] text-brand-muted whitespace-nowrap">{c.transcribed} done</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-brand-muted">
            {selected.length} of up to {MAX_COLLECTIONS} chosen. Mix handwriting styles and typed lists for a fair comparison.
          </p>
        </div>

        <div className="space-y-3 md:w-56">
          <label className="block text-xs text-brand-muted">
            Pages per collection
            <select
              value={perCollection}
              onChange={(e) => setPerCollection(Number(e.target.value))}
              disabled={running}
              className="mt-1 w-full rounded-xl bg-brand-bg border border-brand-gold/[0.12] px-3 py-2 text-sm text-brand-cream"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button
            onClick={run}
            disabled={running || selected.length === 0 || estimate > overview.budget.remaining}
            className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                {progress.done} of {progress.total}
              </>
            ) : (
              `Run pilot · about $${estimate.toFixed(2)}`
            )}
          </Button>
          <p className="text-[11px] text-brand-muted">
            {pages} pages × {models.length} models at full price. A pilot takes a few minutes.
          </p>
        </div>
      </div>

      {running && (
        <div className="h-1.5 rounded-full bg-brand-bg overflow-hidden" role="progressbar" aria-label="Pilot progress" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
          <div className="h-full bg-brand-gold transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
      )}

      {trials.length > 0 && (
        <TrialCompare
          trials={trials}
          models={models}
          activeModel={overview.model}
          collectionNames={collectionNames}
          onUseModel={useModel}
          savingModel={savingModel}
        />
      )}
    </section>
  );
}
