'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { fetchApi, type ApiResult } from '@/lib/import/http';
import type { TranscriptionOverview } from '@/lib/transcription/types';
import { AiBudgetMeter } from '@/components/admin/ai-budget-meter';
import { PilotPanel } from './pilot-panel';
import { BatchPanel } from './batch-panel';
import { JobsList } from './jobs-list';

const OVERVIEW_URL = '/api/admin/transcription?action=overview';

/** While a batch runs, check on it this often. */
const POLL_MS = 30_000;

/** Admin → Transcriptions: the budget, the pilot, collection batches and their progress. */
export function TranscriptionManager() {
  const [overview, setOverview] = useState<TranscriptionOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(({ ok, data }: ApiResult) => {
    if (ok) {
      setOverview(data as unknown as TranscriptionOverview);
      setError(null);
    } else {
      setError(data.error ?? 'Could not load transcriptions');
    }
  }, []);

  const load = useCallback(async () => apply(await fetchApi(OVERVIEW_URL)), [apply]);

  useEffect(() => {
    let active = true;
    void fetchApi(OVERVIEW_URL).then((result) => {
      if (active) apply(result);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const running = overview?.jobs.some((j) => j.status === 'submitting' || j.status === 'processing' || j.status === 'ingesting');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const collectionNames = useMemo(
    () => new Map((overview?.collections ?? []).map((c) => [c.slug, c.name])),
    [overview?.collections],
  );

  if (error) {
    return (
      <div className="bg-brand-card border border-brand-burgundy/30 rounded-2xl p-6 flex items-start gap-3" role="alert">
        <AlertCircle className="w-5 h-5 text-brand-burgundy-light shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-brand-cream">{error}</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <p className="text-sm text-brand-muted flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <AiBudgetMeter budget={overview.budget} />
      <PilotPanel
        overview={overview}
        onModelChange={(model) => setOverview((prev) => (prev ? { ...prev, model } : prev))}
        onFinished={load}
      />
      <BatchPanel overview={overview} onStarted={load} />
      <JobsList jobs={overview.jobs} collectionNames={collectionNames} onChanged={load} />
    </div>
  );
}
