'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { linkRenamed, renameStorageItem, retryRename, type RenameProgress } from '@/lib/storage/client';
import { baseName, finalStorageName, splitFileName } from '@/lib/storage/names';
import type { RenamePlan } from '@/lib/storage/types';
import { useStorageReferences } from '@/lib/hooks/use-storage-references';
import { StorageNameField } from './storage-name-field';
import { StorageReferenceNotice } from './storage-reference-notice';

export interface StorageRenameTarget {
  bucket: string;
  path: string;
  kind: 'file' | 'folder';
}

interface StorageRenameDialogProps {
  target: StorageRenameTarget;
  onClose: () => void;
  /** Called once anything moved, so the listing can refresh. */
  onRenamed: () => void;
}

type Outcome =
  | { kind: 'partial'; plan: RenamePlan; failed: { path: string; error: string }[]; updated: number }
  | { kind: 'link-failed'; plan: RenamePlan; failed: { path: string; error: string }[]; error: string };

/**
 * Rename a file or folder. Storage has no real rename, so every file is moved
 * to its new name and each record linking to one is updated to match.
 */
export function StorageRenameDialog({ target, onClose, onRenamed }: StorageRenameDialogProps) {
  const currentName = baseName(target.path);
  const { stem, ext } = target.kind === 'file' ? splitFileName(currentName) : { stem: currentName, ext: '' };
  const fieldKind = target.kind === 'folder' ? 'clean' : 'file';

  const refs = useStorageReferences(target);
  const [value, setValue] = useState(stem);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RenameProgress | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const running = progress !== null && progress.phase !== 'done' && !outcome;
  const finalName = finalStorageName(fieldKind, value, ext);

  const finish = (plan: RenamePlan, updated: number) => {
    toast.success(
      `Renamed to ${baseName(plan.to)}${updated > 0 ? ` · ${updated.toLocaleString()} record link${updated === 1 ? '' : 's'} updated` : ''}`,
    );
    onRenamed();
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!finalName || running) return;
    setError(null);
    setOutcome(null);
    // The latest progress, read in the catch below (state would be stale there).
    let latest: RenameProgress | null = null;
    try {
      const result = await renameStorageItem({
        bucket: target.bucket,
        kind: target.kind,
        path: target.path,
        name: value,
        onProgress: (p) => {
          latest = p;
          setProgress(p);
        },
      });
      if (result.failed.length === 0) return finish(result.plan, result.updated);
      onRenamed();
      setOutcome({ kind: 'partial', plan: result.plan, failed: result.failed, updated: result.updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rename failed';
      const reached = latest as RenameProgress | null;
      if (!reached?.plan) {
        // Failed before anything moved (e.g. the name is taken): back to editing.
        setProgress(null);
        setError(message);
        return;
      }
      // Files moved; only the link update failed. Offer to retry just that.
      onRenamed();
      setOutcome({ kind: 'link-failed', plan: reached.plan, failed: reached.failed, error: message });
    }
  };

  // Retries whatever failed last time: the unmoved files (then re-links), or just the link update.
  const retry = async () => {
    if (!outcome) return;
    const previous = outcome;
    setOutcome(null);
    let latest: RenameProgress | null = null;
    const onProgress = (p: RenameProgress) => {
      latest = p;
      setProgress(p);
    };
    try {
      const result =
        previous.kind === 'partial'
          ? await retryRename({ bucket: target.bucket, kind: target.kind, plan: previous.plan, failed: previous.failed, onProgress })
          : {
              failed: previous.failed,
              updated: await linkRenamed(target.bucket, target.kind, previous.plan, previous.failed, previous.plan.objects.length, onProgress),
            };
      if (result.failed.length === 0) return finish(previous.plan, result.updated);
      onRenamed();
      setOutcome({ kind: 'partial', plan: previous.plan, failed: result.failed, updated: result.updated });
    } catch (err) {
      // Only the link update can throw here; keep the up-to-date list of unmoved
      // files so the next retry never re-points links at files that didn't move.
      const reached = latest as RenameProgress | null;
      onRenamed();
      setOutcome({
        kind: 'link-failed',
        plan: previous.plan,
        failed: reached?.failed ?? previous.failed,
        error: err instanceof Error ? err.message : 'Updating links failed',
      });
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.moved / progress.total) * 100) : 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent
        className="bg-brand-card border-brand-gold/[0.12] text-brand-cream sm:max-w-md"
        showCloseButton={!running}
        onInteractOutside={(e) => running && e.preventDefault()}
        onEscapeKeyDown={(e) => running && e.preventDefault()}
      >
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-brand-cream">Rename {target.kind}</DialogTitle>
            <DialogDescription className="text-brand-muted break-all">
              <span className="font-mono">{target.bucket}/{target.path}</span>
            </DialogDescription>
          </DialogHeader>

          {!progress && !outcome && (
            <>
              <StorageNameField
                id="rename-name"
                label="New name"
                value={value}
                onChange={setValue}
                kind={fieldKind}
                extension={ext}
                autoFocus
              />
              <StorageReferenceNotice
                loading={refs.loading}
                error={refs.error}
                summary={refs.summary}
                onRetry={refs.retry}
                tone="info"
                consequence="Their links are updated to the new name automatically."
              />
              {error && (
                <p role="alert" className="rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/10 px-3 py-2 text-sm text-brand-burgundy-light">
                  {error}
                </p>
              )}
            </>
          )}

          {progress && !outcome && (
            <div className="space-y-2" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-brand-cream">
                <Loader2 className="w-4 h-4 animate-spin text-brand-gold" aria-hidden="true" />
                {progress.phase === 'preparing' && 'Preparing…'}
                {progress.phase === 'moving' && `Moving files… ${progress.moved.toLocaleString()} of ${progress.total.toLocaleString()}`}
                {(progress.phase === 'linking' || progress.phase === 'done') && 'Updating record links…'}
              </p>
              <div className="h-1.5 rounded-full bg-brand-bg overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand-gold transition-[width] duration-300" style={{ width: `${progress.phase === 'preparing' ? 0 : percent}%` }} />
              </div>
              <p className="text-[11px] text-brand-muted">Keep this window open until it finishes.</p>
            </div>
          )}

          {outcome?.kind === 'partial' && (
            <div className="space-y-2" role="alert">
              <p className="flex items-start gap-2 text-sm text-brand-cream">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
                {(outcome.plan.objects.length - outcome.failed.length).toLocaleString()} of {outcome.plan.objects.length.toLocaleString()} files moved
                {outcome.updated > 0 && ` and ${outcome.updated.toLocaleString()} record links updated`}. These couldn’t be moved and kept their old name:
              </p>
              <ul className="max-h-32 overflow-y-auto rounded-xl border border-brand-gold/[0.12] divide-y divide-brand-gold/[0.06] text-[11px]">
                {outcome.failed.map((f) => (
                  <li key={f.path} className="px-3 py-1.5">
                    <span className="font-mono text-brand-cream break-all">{baseName(f.path)}</span>
                    <span className="block text-brand-burgundy-light">{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outcome?.kind === 'link-failed' && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/10 px-3 py-2 text-sm text-brand-burgundy-light">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                The files moved, but record links didn’t update: {outcome.error}. Until they do, those records’ images won’t show.
              </span>
            </p>
          )}

          <DialogFooter>
            {outcome ? (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-brand-gold/20 text-brand-cream">
                  Close
                </Button>
                <Button type="button" onClick={retry} className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light">
                  {outcome.kind === 'partial' ? 'Retry failed files' : 'Retry updating links'}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={running} className="rounded-xl border-brand-gold/20 text-brand-cream">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={running || !finalName || finalName === currentName || refs.loading}
                  className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Renaming" /> : (
                    <><CheckCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Rename</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
