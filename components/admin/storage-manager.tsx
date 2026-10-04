'use client';

import { useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { storageApi } from '@/lib/storage/client';
import { FORUM_MEDIA_BUCKET, joinPath } from '@/lib/storage/names';
import type { StorageBucket } from '@/lib/storage/types';
import { useStorageListing, type StorageLocation } from '@/lib/hooks/use-storage';
import { StorageBucketTile, StorageFileTile, StorageFolderTile } from './storage-tile';
import { StorageCreateDialog } from './storage-create-dialog';
import { StorageDeleteDialog, type StorageDeleteTarget } from './storage-delete-dialog';
import { StorageRenameDialog, type StorageRenameTarget } from './storage-rename-dialog';

interface StorageManagerProps {
  location: StorageLocation;
  onNavigate: (location: StorageLocation) => void;
  buckets: StorageBucket[] | null;
  bucketsLoading: boolean;
  bucketsError: string | null;
  onBucketsChanged: () => void;
  /** Bump to reload the open folder (e.g. after an upload batch lands in it). */
  refreshKey: number;
  /** Files dropped onto an open, editable folder. */
  onDropFiles?: (files: File[]) => void;
}

/**
 * Supabase Storage as a file manager: buckets, then folders and files with
 * thumbnails. Create, rename and delete buckets/folders/files from here;
 * renames keep every collection record's image link pointing at the file.
 */
export function StorageManager({
  location,
  onNavigate,
  buckets,
  bucketsLoading,
  bucketsError,
  onBucketsChanged,
  refreshKey,
  onDropFiles,
}: StorageManagerProps) {
  const { bucket, folder } = location;
  const listing = useStorageListing(location, refreshKey);
  const current = buckets?.find((b) => b.name === bucket) ?? null;
  const locked = Boolean(current?.locked);
  const missing = Boolean(bucket) && buckets !== null && !current;

  const [creating, setCreating] = useState<'bucket' | 'folder' | null>(null);
  const [renaming, setRenaming] = useState<StorageRenameTarget | null>(null);
  const [deleting, setDeleting] = useState<StorageDeleteTarget | null>(null);
  const [dragging, setDragging] = useState(false);

  const segments = folder ? folder.split('/') : [];
  const canDrop = Boolean(onDropFiles && bucket && current && !locked);

  const handleCreate = async (name: string) => {
    if (creating === 'bucket') {
      const created = await storageApi.createBucket(name);
      toast.success(`Bucket “${created.name}” created`);
      onBucketsChanged();
      onNavigate({ bucket: created.name, folder: '' });
    } else {
      const created = await storageApi.createFolder(bucket, folder, name);
      toast.success(`Folder “${created.name}” created`);
      listing.reload();
    }
  };

  const dropProps = canDrop
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onDropFiles?.(Array.from(e.dataTransfer.files));
        },
      }
    : {};

  return (
    <section
      aria-label="Storage"
      className={`relative rounded-2xl border bg-brand-card transition-colors ${
        dragging ? 'border-brand-gold bg-brand-gold/[0.04]' : 'border-brand-gold/[0.08]'
      }`}
      {...dropProps}
    >
      {/* Header: breadcrumb + actions */}
      <div className="flex flex-col gap-3 border-b border-brand-gold/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Folder path" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-0.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => onNavigate({ bucket: '', folder: '' })}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-brand-bg ${bucket ? 'text-brand-muted hover:text-brand-cream' : 'text-brand-gold'}`}
              >
                <HardDrive className="w-3.5 h-3.5" aria-hidden="true" /> Storage
              </button>
            </li>
            {bucket && (
              <li className="flex items-center gap-0.5 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onNavigate({ bucket, folder: '' })}
                  aria-current={segments.length === 0 ? 'location' : undefined}
                  className={`flex items-center gap-1 truncate rounded-lg px-2 py-1 transition-colors hover:bg-brand-bg ${segments.length ? 'text-brand-muted hover:text-brand-cream' : 'text-brand-gold'}`}
                >
                  {locked && <Lock className="w-3 h-3" aria-label="View only" />}
                  {bucket}
                </button>
              </li>
            )}
            {segments.map((segment, i) => (
              <li key={i} className="flex items-center gap-0.5 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onNavigate({ bucket, folder: segments.slice(0, i + 1).join('/') })}
                  aria-current={i === segments.length - 1 ? 'location' : undefined}
                  className={`truncate rounded-lg px-2 py-1 transition-colors hover:bg-brand-bg ${i === segments.length - 1 ? 'text-brand-gold' : 'text-brand-muted hover:text-brand-cream'}`}
                >
                  {segment}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {(listing.refreshing || (bucketsLoading && buckets)) && (
            <Loader2 className="w-4 h-4 animate-spin text-brand-muted" aria-label="Refreshing" />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (bucket ? listing.reload() : onBucketsChanged())}
            className="h-9 rounded-xl border-brand-gold/20 text-brand-cream"
            aria-label="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {!bucket ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setCreating('bucket')}
              className="h-9 rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New bucket
            </Button>
          ) : (
            current && !locked && (
              <Button
                type="button"
                size="sm"
                onClick={() => setCreating('folder')}
                className="h-9 rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
              >
                <FolderPlus className="w-3.5 h-3.5 mr-1" /> New folder
              </Button>
            )
          )}
        </div>
      </div>

      <div className="p-4">
        {locked && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-brand-gold/20 bg-brand-gold/[0.05] px-3 py-2 text-xs text-brand-cream">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-gold" aria-hidden="true" />
            The site stores {bucket === FORUM_MEDIA_BUCKET ? 'forum post' : 'family tree'} uploads here and links to them by name,
            so this bucket is view-only.
          </p>
        )}

        {!bucket ? (
          // Root: every bucket
          bucketsError && !buckets ? (
            <ErrorState message={bucketsError} onRetry={onBucketsChanged} />
          ) : !buckets ? (
            <TileSkeletons rows />
          ) : buckets.length === 0 ? (
            <EmptyState title="No buckets yet" hint="Create one to start uploading." />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {buckets.map((b) => (
                <StorageBucketTile
                  key={b.name}
                  bucket={b}
                  onOpen={() => onNavigate({ bucket: b.name, folder: '' })}
                  onDelete={b.locked ? undefined : () => setDeleting({ bucket: b.name, path: '', kind: 'bucket', name: b.name })}
                />
              ))}
            </div>
          )
        ) : missing ? (
          <ErrorState message={`There's no bucket called “${bucket}”.`} onRetry={() => onNavigate({ bucket: '', folder: '' })} retryLabel="See all buckets" />
        ) : listing.loading ? (
          <TileSkeletons />
        ) : listing.error && listing.folders.length + listing.files.length === 0 ? (
          <ErrorState message={listing.error} onRetry={listing.reload} />
        ) : listing.folders.length + listing.files.length === 0 ? (
          <EmptyState
            title="This folder is empty"
            hint={locked ? undefined : canDrop ? 'Drop files here, or add them in Upload below.' : undefined}
          />
        ) : (
          <div className="space-y-4">
            {listing.folders.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {listing.folders.map((f) => (
                  <StorageFolderTile
                    key={f.path}
                    bucket={bucket}
                    folder={f}
                    onOpen={() => onNavigate({ bucket, folder: f.path })}
                    onRename={locked ? undefined : () => setRenaming({ bucket, path: f.path, kind: 'folder' })}
                    onDelete={locked ? undefined : () => setDeleting({ bucket, path: f.path, kind: 'folder', name: f.name })}
                  />
                ))}
              </div>
            )}
            {listing.files.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {listing.files.map((f) => (
                  <StorageFileTile
                    key={f.path}
                    bucket={bucket}
                    file={f}
                    onRename={locked ? undefined : () => setRenaming({ bucket, path: f.path, kind: 'file' })}
                    onDelete={locked ? undefined : () => setDeleting({ bucket, path: f.path, kind: 'file', name: f.name })}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-muted">
              <span>
                {listing.folders.length.toLocaleString()} folder{listing.folders.length === 1 ? '' : 's'} ·{' '}
                {listing.files.length.toLocaleString()} file{listing.files.length === 1 ? '' : 's'}
                {listing.hasMore && ' shown'}
              </span>
              {listing.hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={listing.loadMore}
                  disabled={listing.loadingMore}
                  className="h-8 rounded-xl border-brand-gold/20 text-brand-cream"
                >
                  {listing.loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Loading" /> : 'Load more'}
                </Button>
              )}
            </div>
            {listing.error && <p className="text-xs text-brand-burgundy-light" role="alert">{listing.error}</p>}
          </div>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-brand-bg/70">
          <p className="flex items-center gap-2 rounded-xl bg-brand-card px-4 py-2 text-sm text-brand-cream shadow-lg">
            <Upload className="w-4 h-4 text-brand-gold" aria-hidden="true" /> Drop to upload into{' '}
            <span className="font-mono">{joinPath(bucket, folder)}</span>
          </p>
        </div>
      )}

      <StorageCreateDialog
        open={creating !== null}
        onOpenChange={(open) => !open && setCreating(null)}
        kind={creating ?? 'folder'}
        location={joinPath(bucket, folder)}
        onCreate={handleCreate}
      />
      {renaming && (
        <StorageRenameDialog
          key={`${renaming.bucket}/${renaming.path}`}
          target={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={listing.reload}
        />
      )}
      {deleting && (
        <StorageDeleteDialog
          key={`${deleting.kind}:${deleting.bucket}/${deleting.path}`}
          target={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            if (deleting.kind === 'bucket') onBucketsChanged();
            else listing.reload();
          }}
        />
      )}
    </section>
  );
}

function TileSkeletons({ rows = false }: { rows?: boolean }) {
  return rows ? (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl bg-brand-bg" />)}
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-xl bg-brand-bg" />)}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <FolderOpen className="w-8 h-8 text-brand-gold/60" aria-hidden="true" />
      <p className="text-sm text-brand-cream">{title}</p>
      {hint && <p className="text-xs text-brand-muted">{hint}</p>}
    </div>
  );
}

function ErrorState({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="alert">
      <AlertCircle className="w-7 h-7 text-brand-burgundy-light" aria-hidden="true" />
      <p className="max-w-sm text-sm text-brand-cream">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="rounded-xl border-brand-gold/20 text-brand-cream">
        {retryLabel}
      </Button>
    </div>
  );
}
