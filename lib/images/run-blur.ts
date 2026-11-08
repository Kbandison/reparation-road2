import { createClient } from '@/lib/supabase/client';
import { blurScan, type ScanKind } from '@/lib/images/blur-scan';

/**
 * Drives /api/admin/image-blur from the admin's browser: blurs every scan of a
 * collection that isn't blurred yet, or restores a collection's originals.
 * Browser only. Shared by the collection edit window and the import wizard.
 */

const ENDPOINT = '/api/admin/image-blur';
// Server batches are capped at 20; small ones keep progress moving.
const BATCH = 5;

export interface BlurStatus {
  blurImages: boolean;
  totalScans: number;
  blurred: number;
  pending: string[];
  /** Blurred, but the original is still in its public bucket. */
  stuck: number;
  restorable: number;
  /** Links that aren't into this site's storage, so can't be blurred. */
  unreachable: number;
}

export interface BlurProgress {
  done: number;
  total: number;
}

export interface BlurRunResult {
  blurred: number;
  failed: { key: string; error: string }[];
  /** Other collections that linked to the same files (they show the copies now too). */
  alsoUsedBy: string[];
}

interface PreparedItem {
  key: string;
  kind?: ScanKind;
  downloadUrl?: string;
  fallbackUrl?: string;
  upload?: { bucket: string; path: string; token: string };
  error?: string;
}

async function call<T>(init?: { method: 'POST'; body: Record<string, unknown> }, query = ''): Promise<T> {
  const res = await fetch(`${ENDPOINT}${query}`, init && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The image blur request failed (${res.status}).`);
  return data as T;
}

export const getBlurStatus = (collection: string) =>
  call<BlurStatus>(undefined, `?collection=${encodeURIComponent(collection)}`);

export const setBlurSwitch = (collection: string, on: boolean) =>
  call<{ blurImages: boolean }>({ method: 'POST', body: { action: on ? 'enable' : 'disable', collection } });

async function download(item: PreparedItem): Promise<Blob> {
  const first = await fetch(item.downloadUrl!).catch(() => null);
  if (first?.ok) return first.blob();
  // The resize endpoint refuses some oversize scans; the raw file always works.
  if (item.fallbackUrl && item.fallbackUrl !== item.downloadUrl) {
    const raw = await fetch(item.fallbackUrl);
    if (raw.ok) return raw.blob();
  }
  throw new Error(`The original couldn't be downloaded (${first?.status ?? 'network error'}).`);
}

/**
 * Blurs every scan of the collection that isn't blurred yet. Turns the
 * collection's blur switch on first, so pages hide the originals at once.
 * One file failing doesn't stop the rest; failures come back in the result.
 */
export async function blurCollection(
  collection: string,
  onProgress?: (progress: BlurProgress) => void,
): Promise<BlurRunResult> {
  await setBlurSwitch(collection, true);
  const status = await getBlurStatus(collection);
  const storage = createClient().storage;

  const result: BlurRunResult = { blurred: 0, failed: [], alsoUsedBy: [] };
  const total = status.pending.length;
  let done = 0;
  onProgress?.({ done, total });

  for (let i = 0; i < total; i += BATCH) {
    const keys = status.pending.slice(i, i + BATCH);
    const { items } = await call<{ items: PreparedItem[] }>({ method: 'POST', body: { action: 'prepare', collection, keys } });

    const uploaded: string[] = [];
    // One at a time: blurring is CPU-heavy, and a big PDF holds a lot of memory.
    for (const item of items) {
      try {
        if (item.error || !item.upload || !item.kind) throw new Error(item.error || 'No upload slot');
        const blurred = await blurScan(await download(item), item.kind);
        const { error } = await storage
          .from(item.upload.bucket)
          .uploadToSignedUrl(item.upload.path, item.upload.token, blurred.blob, {
            contentType: blurred.contentType,
            upsert: true,
          });
        if (error) throw new Error(`Uploading the blurred copy failed: ${error.message}`);
        uploaded.push(item.key);
      } catch (err) {
        result.failed.push({ key: item.key, error: err instanceof Error ? err.message : 'Blurring failed' });
      }
    }

    if (uploaded.length > 0) {
      const { results } = await call<{
        results: { key: string; ok: boolean; error?: string; alsoUsedBy?: string[] }[];
      }>({ method: 'POST', body: { action: 'commit', collection, keys: uploaded } });
      for (const r of results) {
        if (r.ok) result.blurred++;
        // ok with an error: blurred and relinked, but the original didn't move.
        if (r.error) result.failed.push({ key: r.key, error: r.error });
        for (const label of r.alsoUsedBy ?? []) if (!result.alsoUsedBy.includes(label)) result.alsoUsedBy.push(label);
      }
    }

    done += keys.length;
    onProgress?.({ done, total });
  }

  // Originals left public by an earlier run get another try.
  if (status.stuck > 0) {
    for (let pass = 0; pass < Math.ceil(status.stuck / 20); pass++) {
      const { errors } = await call<{ moved: number; errors: string[] }>({
        method: 'POST',
        body: { action: 'retry-moves', collection },
      });
      if (errors.length) {
        result.failed.push(...errors.map((e) => ({ key: e.split(':')[0], error: e })));
        break;
      }
    }
  }
  return result;
}

/** Puts every original back, deletes the copies, then turns the blur switch off. */
export async function restoreCollection(
  collection: string,
  onProgress?: (progress: BlurProgress) => void,
): Promise<{ restored: number; errors: string[] }> {
  const status = await getBlurStatus(collection);
  const total = status.restorable;
  let restored = 0;
  onProgress?.({ done: 0, total });

  for (;;) {
    const batch = await call<{ restored: number; remaining: number; errors: string[] }>({
      method: 'POST',
      body: { action: 'restore', collection },
    });
    restored += batch.restored;
    onProgress?.({ done: restored, total });
    // Stop on errors rather than retrying the same files forever.
    if (batch.errors.length) return { restored, errors: batch.errors };
    if (batch.remaining === 0) break;
  }
  await setBlurSwitch(collection, false);
  return { restored, errors: [] };
}
