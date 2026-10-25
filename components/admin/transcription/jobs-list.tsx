'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchApi } from '@/lib/import/http';
import { MODEL_LABELS } from '@/lib/ai/models';
import type { TranscriptionJobView } from '@/lib/transcription/types';

const STATUS: Record<TranscriptionJobView['status'], { label: string; style: string }> = {
  submitting: { label: 'Sending', style: 'bg-brand-gold/15 text-brand-gold' },
  processing: { label: 'Transcribing', style: 'bg-brand-gold/15 text-brand-gold' },
  ingesting: { label: 'Saving', style: 'bg-brand-gold/15 text-brand-gold' },
  done: { label: 'Done', style: 'bg-brand-sage/15 text-brand-sage' },
  failed: { label: 'Failed', style: 'bg-brand-burgundy/20 text-brand-burgundy-light' },
  canceled: { label: 'Canceled', style: 'bg-brand-muted/15 text-brand-muted' },
};

interface JobsListProps {
  jobs: TranscriptionJobView[];
  collectionNames: Map<string, string>;
  onChanged: () => void;
}

/** Recent transcription batches, newest first. */
export function JobsList({ jobs, collectionNames, onChanged }: JobsListProps) {
  const [canceling, setCanceling] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const cancel = async (id: string) => {
    setCanceling(id);
    const { ok, data } = await fetchApi('/api/admin/transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId: id }),
    });
    setCanceling(null);
    if (!ok) toast.error(data.error);
    else {
      toast.success('Canceling. Pages already finished will still be saved.');
      onChanged();
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-brand-cream">Batches</h2>
      <ul className="space-y-2">
        {jobs.map((job) => {
          const status = STATUS[job.status];
          const running = job.status === 'submitting' || job.status === 'processing' || job.status === 'ingesting';
          const cost = job.actual_cost ?? job.estimated_cost;
          return (
            <li key={job.id} className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-brand-cream font-medium">{collectionNames.get(job.collection_slug) ?? job.collection_slug}</p>
                  <p className="text-xs text-brand-muted">
                    {new Date(job.created_at).toLocaleString()} · {MODEL_LABELS[job.model] ?? job.model}
                    {job.include_ocr && ' · including OCR’d pages'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 ${status.style}`}>
                    {running && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                    {status.label}
                  </span>
                  {job.status === 'processing' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancel(job.id)}
                      disabled={canceling === job.id}
                      className="h-7 rounded-xl border-brand-gold/20 text-brand-muted text-xs"
                    >
                      {canceling === job.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : 'Cancel'}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-brand-muted mt-2">
                {job.status === 'done'
                  ? `${job.succeeded.toLocaleString()} of ${job.scan_count.toLocaleString()} pages transcribed${job.failed ? `, ${job.failed.toLocaleString()} failed (they can be sent again)` : ''}`
                  : `${job.scan_count.toLocaleString()} pages`}
                {cost !== null && ` · ${job.actual_cost !== null ? '' : 'about '}$${Number(cost).toFixed(2)}`}
              </p>
              {job.error && <p className="text-xs text-brand-burgundy-light mt-1 break-words">{job.error}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
