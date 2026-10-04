'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { storageApi } from '@/lib/storage/client';
import { joinPath } from '@/lib/storage/names';
import type { StorageLocation } from './use-storage';

export type UploadStatus = 'pending' | 'checking' | 'conflict' | 'uploading' | 'done' | 'error' | 'skipped';

export interface QueuedUpload {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
  /** Replace a file of the same name instead of flagging it. */
  overwrite?: boolean;
  /** Where this file is going; set when its upload starts. */
  destination?: StorageLocation;
  /** "bucket/path" once uploaded: the value a record's image_path takes. */
  storagePath?: string;
}

const isActive = (s: UploadStatus) => s === 'checking' || s === 'uploading';

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/**
 * The upload queue on the media page. Files upload straight to Storage through
 * short-lived signed URLs (no request-size limit for big scans). Before
 * anything is written, names already in the destination folder are flagged so
 * the admin chooses Replace or Skip instead of silently overwriting a scan.
 */
export function useUploadQueue(options: { onBatchDone: (destination: StorageLocation, uploaded: number) => void }) {
  const [items, setItems] = useState<QueuedUpload[]>([]);

  const patch = (ids: Set<string>, change: Partial<QueuedUpload>) =>
    setItems((prev) => prev.map((item) => (ids.has(item.id) ? { ...item, ...change } : item)));
  const patchOne = (id: string, change: Partial<QueuedUpload>) => patch(new Set([id]), change);

  /** Uploads the given items to their destination; `check` first flags names that already exist there. */
  const run = async (batch: QueuedUpload[], destination: StorageLocation, check: boolean) => {
    if (batch.length === 0) return;
    const { bucket, folder } = destination;
    const pathOf = (item: QueuedUpload) => joinPath(folder, item.file.name);
    patch(new Set(batch.map((b) => b.id)), { status: check ? 'checking' : 'uploading', error: undefined, destination });

    let toUpload = batch;
    if (check) {
      try {
        const existing = new Set<string>();
        for (let i = 0; i < batch.length; i += 1000) {
          const res = await storageApi.checkExisting(bucket, batch.slice(i, i + 1000).map(pathOf));
          res.existing.forEach((p) => existing.add(p));
        }
        const clashes = batch.filter((item) => existing.has(pathOf(item)));
        if (clashes.length) patch(new Set(clashes.map((c) => c.id)), { status: 'conflict' });
        toUpload = batch.filter((item) => !existing.has(pathOf(item)));
      } catch (err) {
        patch(new Set(batch.map((b) => b.id)), { status: 'error', error: err instanceof Error ? err.message : 'Could not check the folder' });
        return;
      }
    }

    const supabase = createClient();
    let uploaded = 0;
    await pool(toUpload, 4, async (item) => {
      patchOne(item.id, { status: 'uploading' });
      const path = pathOf(item);
      const upsert = Boolean(item.overwrite);
      try {
        const signed = await storageApi.signedUploadUrl(bucket, path, upsert);
        const { error } = await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(signed.path, signed.token, item.file, { contentType: item.file.type || undefined, upsert });
        if (error) throw error;
        uploaded++;
        patchOne(item.id, { status: 'done', storagePath: joinPath(bucket, signed.path) });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        // Someone else created the file between the check and the upload.
        if (!upsert && /already exists|duplicate/i.test(message)) patchOne(item.id, { status: 'conflict' });
        else patchOne(item.id, { status: 'error', error: message });
      }
    });
    options.onBatchDone(destination, uploaded);
  };

  /**
   * Queues files (skipping ones already queued). With a destination they start
   * uploading straight away, as when files are dropped onto an open folder.
   */
  const add = (files: File[], startIn?: StorageLocation) => {
    const fingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(items.map((i) => fingerprint(i.file)));
    const stamp = Date.now();
    const additions: QueuedUpload[] = files
      .filter((f) => !seen.has(fingerprint(f)))
      .map((file, i) => ({ id: `${stamp}-${i}-${file.name}`, file, status: 'pending' }));
    if (additions.length === 0) return;
    setItems((prev) => [...prev, ...additions]);
    if (startIn) void run(additions, startIn, true);
  };

  /** Uploads everything waiting (and retries failures) into `destination`. */
  const start = (destination: StorageLocation) =>
    run(items.filter((i) => i.status === 'pending' || i.status === 'error'), destination, true);

  /** Replace = upload over the existing file; Skip = leave it out. */
  const resolve = (ids: string[], choice: 'replace' | 'skip') => {
    const chosen = items.filter((i) => ids.includes(i.id) && i.status === 'conflict');
    if (choice === 'skip') {
      patch(new Set(chosen.map((c) => c.id)), { status: 'skipped' });
      return;
    }
    // Conflicts keep the destination they were checked against.
    const byDestination = new Map<string, { destination: StorageLocation; batch: QueuedUpload[] }>();
    for (const item of chosen) {
      if (!item.destination) continue;
      const key = joinPath(item.destination.bucket, item.destination.folder);
      const group = byDestination.get(key) ?? { destination: item.destination, batch: [] };
      group.batch.push({ ...item, overwrite: true });
      byDestination.set(key, group);
    }
    patch(new Set(chosen.map((c) => c.id)), { overwrite: true });
    for (const { destination, batch } of byDestination.values()) void run(batch, destination, false);
  };

  return {
    items,
    add,
    start,
    resolve,
    remove: (id: string) => setItems((prev) => prev.filter((i) => i.id !== id || isActive(i.status))),
    clearFinished: () => setItems((prev) => prev.filter((i) => i.status !== 'done' && i.status !== 'skipped')),
    counts: {
      waiting: items.filter((i) => i.status === 'pending' || i.status === 'error').length,
      active: items.filter((i) => isActive(i.status)).length,
      conflicts: items.filter((i) => i.status === 'conflict').length,
      done: items.filter((i) => i.status === 'done').length,
      failed: items.filter((i) => i.status === 'error').length,
    },
  };
}
