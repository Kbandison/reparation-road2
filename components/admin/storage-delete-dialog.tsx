'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { storageApi } from '@/lib/storage/client';
import { useStorageReferences } from '@/lib/hooks/use-storage-references';
import type { StorageTargetKind } from '@/lib/storage/types';
import { AdminConfirmDeleteModal } from './admin-confirm-delete-modal';
import { StorageReferenceNotice } from './storage-reference-notice';

export interface StorageDeleteTarget {
  bucket: string;
  /** Path inside the bucket ('' for a bucket). */
  path: string;
  kind: StorageTargetKind;
  name: string;
}

interface StorageDeleteDialogProps {
  target: StorageDeleteTarget;
  onClose: () => void;
  onDeleted: () => void;
}

const WHAT: Record<StorageTargetKind, (name: string) => string> = {
  file: (name) => `the file “${name}”`,
  folder: (name) => `the folder “${name}” and everything in it`,
  bucket: (name) => `the bucket “${name}” and every file in it`,
};

/**
 * Delete confirmation for a file, folder or bucket. Shows which collection
 * records link to what's being deleted, and asks for the name to be typed
 * whenever the delete is bulk or would break links.
 */
export function StorageDeleteDialog({ target, onClose, onDeleted }: StorageDeleteDialogProps) {
  const refs = useStorageReferences(target);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = (refs.summary?.total ?? 0) > 0;
  // Unknown links (the check failed) are treated like known ones.
  const mustType = target.kind !== 'file' || linked || Boolean(refs.error);
  const ready = !refs.loading && (!mustType || typed.trim() === target.name);

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const { removed } =
        target.kind === 'bucket'
          ? await storageApi.deleteBucket(target.bucket)
          : await storageApi.remove(target.bucket, target.kind === 'file' ? { files: [target.path] } : { folders: [target.path] });
      toast.success(
        target.kind === 'file' ? `Deleted ${target.name}` : `Deleted ${target.name} (${removed.toLocaleString()} file${removed === 1 ? '' : 's'})`,
      );
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <AdminConfirmDeleteModal
      title={`Delete ${target.kind}`}
      confirmLabel={`Delete ${target.kind}`}
      busy={busy}
      confirmDisabled={!ready}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p>
          Permanently delete {WHAT[target.kind](target.name)}? This can’t be undone.
        </p>
        <StorageReferenceNotice
          loading={refs.loading}
          error={refs.error}
          summary={refs.summary}
          onRetry={refs.retry}
          tone="danger"
          consequence="Their images will stop showing until they’re linked to another file."
        />
        {mustType && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-delete-name" className="block text-xs text-brand-cream">
              Type <span className="font-mono font-medium">{target.name}</span> to confirm
            </label>
            <Input
              id="confirm-delete-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              className="bg-brand-bg border-brand-burgundy/30 focus:border-brand-burgundy h-9"
            />
          </div>
        )}
      </div>
    </AdminConfirmDeleteModal>
  );
}
