'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ImportCollection } from '@/lib/collections/queries';
import { joinPath } from '@/lib/storage/names';
import { useStorageBuckets, useStorageLocation, type StorageLocation } from '@/lib/hooks/use-storage';
import { useUploadQueue } from '@/lib/hooks/use-upload-queue';
import { StorageManager } from './storage-manager';
import { StorageUploadPanel } from './storage-upload-panel';
import { StorageAttachRecords } from './storage-attach-records';

/**
 * The admin Upload Images page: a file manager over Supabase Storage, an
 * upload queue that drops files into the open folder, and the two ways to tie
 * uploads to records (link existing ones, or import new ones from a
 * spreadsheet matched against the upload folder).
 */
export function ImageUploader({ collections }: { collections: ImportCollection[] }) {
  const { location, navigate } = useStorageLocation();
  const buckets = useStorageBuckets();
  // Bumped after each upload batch: refreshes the open folder and the import's image pool.
  const [uploadVersion, setUploadVersion] = useState(0);
  const [lastDestination, setLastDestination] = useState<StorageLocation | null>(null);

  const queue = useUploadQueue({
    onBatchDone: (destination, uploaded) => {
      if (uploaded > 0) {
        toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'} to ${joinPath(destination.bucket, destination.folder)}`);
        setLastDestination(destination);
      }
      setUploadVersion((v) => v + 1);
    },
  });

  const openBucket = buckets.buckets?.find((b) => b.name === location.bucket) ?? null;
  // Uploads go into the open folder, as long as it's in a bucket that takes them.
  const destination = openBucket && !openBucket.locked ? location : null;
  const blockedReason = !location.bucket
    ? 'Open a bucket above, or create one, to upload into it.'
    : openBucket?.locked
      ? 'This bucket is view-only. Open another bucket to upload.'
      : buckets.loading
        ? 'Loading…'
        : `There's no bucket called “${location.bucket}”.`;

  const uploaded = queue.items
    .filter((i) => i.status === 'done' && i.storagePath)
    .map((i) => ({ name: i.file.name, path: i.storagePath! }));

  return (
    <div className="max-w-6xl space-y-6">
      <StorageManager
        location={location}
        onNavigate={navigate}
        buckets={buckets.buckets}
        bucketsLoading={buckets.loading}
        bucketsError={buckets.error}
        onBucketsChanged={buckets.reload}
        refreshKey={uploadVersion}
        onDropFiles={destination ? (files) => queue.add(files, destination) : undefined}
      />

      <StorageUploadPanel
        destination={destination}
        blockedReason={blockedReason}
        items={queue.items}
        counts={queue.counts}
        onAdd={(files) => queue.add(files)}
        onStart={() => destination && queue.start(destination)}
        onResolve={queue.resolve}
        onRemove={queue.remove}
        onClearFinished={queue.clearFinished}
      />

      <StorageAttachRecords
        collections={collections}
        uploaded={uploaded}
        imageSource={lastDestination ?? destination}
        imageSourceVersion={uploadVersion}
        uploadsInProgress={queue.counts.active}
      />
    </div>
  );
}
