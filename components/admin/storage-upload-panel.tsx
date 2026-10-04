'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, Check, Copy, FilePlus2, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { joinPath } from '@/lib/storage/names';
import { formatBytes } from '@/lib/utils/format';
import type { QueuedUpload } from '@/lib/hooks/use-upload-queue';
import type { StorageLocation } from '@/lib/hooks/use-storage';

interface StorageUploadPanelProps {
  /** Where uploads go: the folder open in the manager. Null when it can't take uploads. */
  destination: StorageLocation | null;
  /** Why there's no destination (shown in place of the drop zone). */
  blockedReason: string;
  items: QueuedUpload[];
  counts: { waiting: number; active: number; conflicts: number; done: number; failed: number };
  onAdd: (files: File[]) => void;
  onStart: () => void;
  onResolve: (ids: string[], choice: 'replace' | 'skip') => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}

function StatusIcon({ status }: { status: QueuedUpload['status'] }) {
  switch (status) {
    case 'done':
      return <Check className="w-4 h-4 text-brand-sage" aria-label="Uploaded" />;
    case 'checking':
    case 'uploading':
      return <Loader2 className="w-4 h-4 text-brand-gold animate-spin" aria-label="Uploading" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-brand-burgundy-light" aria-label="Failed" />;
    case 'conflict':
      return <AlertTriangle className="w-4 h-4 text-brand-gold" aria-label="Already exists" />;
    case 'skipped':
      return <X className="w-4 h-4 text-brand-muted" aria-label="Skipped" />;
    default:
      return <FilePlus2 className="w-4 h-4 text-brand-muted" aria-label="Waiting" />;
  }
}

/** Any file type, straight into the open folder. Large scans upload directly to Storage. */
export function StorageUploadPanel({
  destination,
  blockedReason,
  items,
  counts,
  onAdd,
  onStart,
  onResolve,
  onRemove,
  onClearFinished,
}: StorageUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const conflicts = items.filter((i) => i.status === 'conflict');
  const conflictFolder = conflicts[0]?.destination;

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Path copied');
    } catch {
      toast.error('Couldn’t copy. Your browser blocked clipboard access.');
    }
  };

  return (
    <section aria-labelledby="upload-heading" className="rounded-2xl border border-brand-gold/[0.08] bg-brand-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-gold/[0.08] px-4 py-3">
        <h2 id="upload-heading" className="font-display text-base font-semibold text-brand-cream">Upload</h2>
        {destination && (
          <p className="min-w-0 text-xs text-brand-muted">
            into <span className="font-mono text-brand-cream break-all">{joinPath(destination.bucket, destination.folder)}/</span>
          </p>
        )}
      </div>

      <div className="space-y-4 p-4">
        {destination ? (
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onAdd(Array.from(e.dataTransfer.files));
            }}
            onClick={() => inputRef.current?.click()}
            className={`w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50 ${
              dragOver ? 'border-brand-gold bg-brand-gold/[0.06]' : 'border-brand-gold/30 bg-brand-bg/40 hover:border-brand-gold/50'
            }`}
          >
            <Upload className="mx-auto mb-2 w-7 h-7 text-brand-gold" aria-hidden="true" />
            <span className="block text-sm text-brand-cream">Drop files here, or click to choose</span>
            <span className="mt-1 block text-xs text-brand-muted">Images, PDFs or any other file. Large scans are fine.</span>
          </button>
        ) : (
          <p className="rounded-2xl border border-dashed border-brand-gold/20 bg-brand-bg/40 px-6 py-8 text-center text-sm text-brand-muted">
            {blockedReason}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />

        {conflicts.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p className="text-xs text-brand-cream">
              <span className="font-medium">
                {conflicts.length} file{conflicts.length === 1 ? '' : 's'} already exist{conflicts.length === 1 ? 's' : ''}
              </span>{' '}
              in <span className="font-mono">{conflictFolder ? joinPath(conflictFolder.bucket, conflictFolder.folder) : 'this folder'}</span>.
              Replacing changes the image on every record that links to it.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onResolve(conflicts.map((c) => c.id), 'skip')} className="h-8 rounded-xl border-brand-gold/25 text-brand-cream">
                Skip all
              </Button>
              <Button type="button" size="sm" onClick={() => onResolve(conflicts.map((c) => c.id), 'replace')} className="h-8 rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light">
                Replace all
              </Button>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-brand-gold/[0.08]">
            <div className="flex items-center justify-between border-b border-brand-gold/[0.08] px-4 py-2.5">
              <p className="text-xs text-brand-cream">
                {items.length} file{items.length === 1 ? '' : 's'}
                {counts.done > 0 && <span className="text-brand-sage"> · {counts.done} uploaded</span>}
                {counts.failed > 0 && <span className="text-brand-burgundy-light"> · {counts.failed} failed</span>}
              </p>
              <button type="button" onClick={onClearFinished} className="text-xs text-brand-muted hover:text-brand-cream">
                Clear finished
              </button>
            </div>
            <ul className="max-h-80 divide-y divide-brand-gold/[0.04] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <StatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-brand-cream">{item.file.name}</p>
                    {item.status === 'error' ? (
                      <p className="truncate text-[11px] text-brand-burgundy-light">{item.error}</p>
                    ) : item.status === 'conflict' ? (
                      <p className="text-[11px] text-brand-gold">Already in this folder</p>
                    ) : item.status === 'skipped' ? (
                      <p className="text-[11px] text-brand-muted">Skipped, kept the existing file</p>
                    ) : item.storagePath ? (
                      <p className="truncate text-[11px] text-brand-muted">{item.storagePath}</p>
                    ) : (
                      <p className="text-[11px] text-brand-muted">{formatBytes(item.file.size)}</p>
                    )}
                  </div>
                  {item.status === 'conflict' && (
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => onResolve([item.id], 'skip')} className="rounded-lg px-2 py-1 text-xs text-brand-muted hover:bg-brand-bg hover:text-brand-cream">
                        Skip
                      </button>
                      <button type="button" onClick={() => onResolve([item.id], 'replace')} className="rounded-lg px-2 py-1 text-xs text-brand-gold hover:bg-brand-bg hover:text-brand-gold-light">
                        Replace
                      </button>
                    </div>
                  )}
                  {item.status === 'done' && item.storagePath && (
                    <button type="button" onClick={() => copyPath(item.storagePath!)} className="shrink-0 text-brand-muted hover:text-brand-gold" aria-label={`Copy path of ${item.file.name}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {item.status !== 'uploading' && item.status !== 'checking' && item.status !== 'conflict' && (
                    <button type="button" onClick={() => onRemove(item.id)} className="shrink-0 text-brand-muted hover:text-brand-burgundy-light" aria-label={`Remove ${item.file.name}`}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={onStart}
            disabled={!destination || counts.waiting === 0}
            className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
          >
            {counts.active > 0 ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> Uploading…</>
            ) : (
              <><Upload className="w-4 h-4 mr-1.5" aria-hidden="true" /> Upload{counts.waiting ? ` ${counts.waiting}` : ''}</>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
