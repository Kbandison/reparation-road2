'use client';

import { useCallback, useEffect, useState } from 'react';
import { EyeOff, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  blurCollection,
  getBlurStatus,
  restoreCollection,
  type BlurProgress,
  type BlurStatus,
} from '@/lib/images/run-blur';
import type { Collection } from '@/lib/types';

interface CollectionBlurFieldsProps {
  collection: Collection;
  imageLink: string;
  onImageLinkChange: (value: string) => void;
  linkColumn: string;
  onLinkColumnChange: (value: string) => void;
  /** True while blurring or restoring, so the edit window can't be closed mid-run. */
  onBusyChange: (busy: boolean) => void;
}

type Run = { kind: 'blur' | 'restore'; progress: BlurProgress } | null;

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * Rights-restricted images for one collection, in its edit window: blur the
 * scans (the work runs in this browser), set where the blurred image links to,
 * or restore the originals. See lib/collections/blur.ts.
 */
export function CollectionBlurFields({
  collection,
  imageLink,
  onImageLinkChange,
  linkColumn,
  onLinkColumnChange,
  onBusyChange,
}: CollectionBlurFieldsProps) {
  const [status, setStatus] = useState<BlurStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [run, setRun] = useState<Run>(null);
  const [confirm, setConfirm] = useState<'blur' | 'restore' | null>(null);

  const loadStatus = useCallback(
    (isActive: () => boolean = () => true) =>
      getBlurStatus(collection.slug)
        .then((next) => {
          if (!isActive()) return;
          setStatus(next);
          setStatusError(null);
        })
        .catch((err) => {
          if (isActive()) setStatusError(err instanceof Error ? err.message : 'Could not read the images');
        }),
    [collection.slug],
  );

  // Loads once per collection, and again after every blur or restore.
  useEffect(() => {
    let active = true;
    loadStatus(() => active);
    return () => {
      active = false;
    };
  }, [loadStatus]);

  // The link column picker lists the table's columns.
  useEffect(() => {
    if (!collection.table_name) return;
    let active = true;
    fetch(`/api/admin/import?action=schema&table=${encodeURIComponent(collection.table_name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && Array.isArray(d?.columns)) setColumns(d.columns as string[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [collection.table_name]);

  // Leaving the page mid-run would strand a batch, so the browser asks first.
  useEffect(() => {
    onBusyChange(run !== null);
    if (!run) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run, onBusyChange]);

  const startBlur = async () => {
    setConfirm(null);
    setRun({ kind: 'blur', progress: { done: 0, total: status?.pending.length ?? 0 } });
    try {
      const result = await blurCollection(collection.slug, (progress) => setRun({ kind: 'blur', progress }));
      if (result.failed.length === 0) toast.success(result.blurred ? `Blurred ${plural(result.blurred, 'image')}` : 'Every image is blurred');
      else {
        toast.error(`${plural(result.failed.length, 'image')} need attention: ${result.failed[0].error}`);
        console.error('[image-blur] failures', result.failed);
      }
      if (result.alsoUsedBy.length) {
        toast.message(`The same files were also used by ${result.alsoUsedBy.join(', ')}, which now show the blurred copies too.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Blurring failed');
    }
    setRun(null);
    await loadStatus();
  };

  const startRestore = async () => {
    setConfirm(null);
    setRun({ kind: 'restore', progress: { done: 0, total: status?.restorable ?? 0 } });
    try {
      const result = await restoreCollection(collection.slug, (progress) => setRun({ kind: 'restore', progress }));
      if (result.errors.length === 0) toast.success(`Restored ${plural(result.restored, 'original')}`);
      else toast.error(`Restored ${result.restored}, then stopped: ${result.errors[0]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restoring failed');
    }
    setRun(null);
    await loadStatus();
  };

  if (!collection.table_name) return null;

  const on = status?.blurImages ?? collection.blur_images === true;
  const waiting = status ? status.pending.length + status.stuck : 0;
  const percent = run && run.progress.total > 0 ? Math.round((run.progress.done / run.progress.total) * 100) : 0;

  return (
    <div className="space-y-4 border-t border-brand-gold/[0.08] pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5 text-brand-muted" aria-hidden="true" />
            Blurred images
          </Label>
          <p className="text-[11px] text-brand-muted mt-1">
            For scans that can&apos;t be shown in full (rights or licensing). Everyone sees a heavily
            blurred copy. The originals move to private storage and can be restored.
          </p>
        </div>
        <span
          className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md ${on ? 'bg-brand-gold/10 text-brand-gold' : 'bg-brand-muted/10 text-brand-muted'}`}
        >
          {on ? 'On' : 'Off'}
        </span>
      </div>

      {statusError && (
        <p className="text-xs text-brand-burgundy-light bg-brand-burgundy/10 border border-brand-burgundy/20 rounded-xl px-3 py-2">
          {statusError}
        </p>
      )}

      {status && (
        <p className="text-xs text-brand-cream-muted">
          {plural(status.totalScans, 'image')}
          {on && ` · ${status.blurred.toLocaleString()} blurred`}
          {on && waiting > 0 && <span className="text-brand-gold"> · {waiting.toLocaleString()} waiting</span>}
          {status.unreachable > 0 && ` · ${status.unreachable.toLocaleString()} linked from outside this site (can’t be blurred)`}
        </p>
      )}

      {run && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="h-1.5 rounded-full bg-brand-card overflow-hidden">
            <div className="h-full bg-brand-gold transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] text-brand-muted">
            {run.kind === 'blur' ? 'Blurring' : 'Restoring'} {run.progress.done.toLocaleString()} of{' '}
            {run.progress.total.toLocaleString()}… keep this window open.
          </p>
        </div>
      )}

      {!run && status && (
        <div className="flex flex-wrap gap-2">
          {(!on || waiting > 0) && status.totalScans > 0 && (
            <Button
              type="button"
              onClick={() => setConfirm('blur')}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl text-xs h-8"
            >
              <EyeOff className="w-3.5 h-3.5 mr-1.5" />
              {on ? `Blur ${plural(waiting, 'waiting image')}` : 'Blur this collection’s images'}
            </Button>
          )}
          {on && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm('restore')}
              className="border-brand-gold/20 text-brand-cream rounded-xl text-xs h-8"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Restore the originals
            </Button>
          )}
        </div>
      )}

      {on && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-image-link" className="text-xs text-brand-muted">
              Link for every record (optional)
            </Label>
            <Input
              id="edit-image-link"
              type="url"
              inputMode="url"
              value={imageLink}
              onChange={(e) => onImageLinkChange(e.target.value)}
              placeholder="https://… where the original image can be seen"
              className="bg-brand-card border-brand-gold/[0.15]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-image-link-column" className="text-xs text-brand-muted">
              Column with each record&apos;s own link (optional)
            </Label>
            <select
              id="edit-image-link-column"
              value={linkColumn}
              onChange={(e) => onLinkColumnChange(e.target.value)}
              className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-card px-3 py-2 text-sm text-brand-cream focus:border-brand-gold/40 focus:outline-none"
            >
              <option value="">None</option>
              {/* Keep a saved column listed even before the column list loads. */}
              {linkColumn && !columns.includes(linkColumn) && <option value={linkColumn}>{linkColumn}</option>}
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-brand-muted">
              A record&apos;s own link wins over the one above. Hovering the image shows &ldquo;View the
              original image&rdquo;, and clicking opens the link. Images with no link keep their usual zoom.
            </p>
          </div>
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent className="bg-brand-bg border-brand-gold/[0.12] rounded-2xl text-brand-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-brand-cream">
              {confirm === 'restore'
                ? `Restore ${collection.name}'s original images?`
                : `Blur ${collection.name}'s images?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-brand-cream-muted">
              {confirm === 'restore'
                ? `The ${plural(status?.restorable ?? 0, 'original')} go back to public storage and show in full again for everyone, and the blurred copies are deleted.`
                : `Everyone will see a heavily blurred copy of ${plural(status?.pending.length ?? 0, 'image')}. The originals move to private storage (they can be restored later). Blurring runs in this browser: keep this window open until it finishes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-brand-gold/20 text-brand-cream rounded-xl">Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={confirm === 'restore' ? startRestore : startBlur}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              {confirm === 'restore' ? 'Restore originals' : 'Blur images'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {run === null && status === null && !statusError && (
        <p className="flex items-center gap-1.5 text-[11px] text-brand-muted">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking images…
        </p>
      )}
    </div>
  );
}
