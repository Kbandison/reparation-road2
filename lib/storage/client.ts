import type {
  RenamePlan,
  StorageBucket,
  StorageListing,
  StorageReferenceSummary,
  StorageTargetKind,
} from './types';

/**
 * Browser-side calls to /api/admin/storage. Every call throws a readable Error
 * when the route refuses, so callers can show `err.message` as-is.
 */

async function request<T>(init: { query?: Record<string, string>; body?: Record<string, unknown> }): Promise<T> {
  const url = init.query ? `/api/admin/storage?${new URLSearchParams(init.query)}` : '/api/admin/storage';
  const res = await fetch(url, {
    method: init.body ? 'POST' : 'GET',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data as T;
}

const post = <T>(action: string, payload: Record<string, unknown>) =>
  request<T>({ body: { action, ...payload } });

export const storageApi = {
  buckets: () => request<{ buckets: StorageBucket[] }>({ query: { action: 'buckets' } }).then((d) => d.buckets),

  list: (bucket: string, folder: string, cursor?: string | null) =>
    request<StorageListing>({ query: { action: 'list', bucket, folder, ...(cursor ? { cursor } : {}) } }),

  references: (bucket: string, path: string, kind: StorageTargetKind) =>
    request<StorageReferenceSummary>({ query: { action: 'references', bucket, path, kind } }),

  createBucket: (name: string) => post<{ name: string }>('create-bucket', { name }),

  createFolder: (bucket: string, parent: string, name: string) =>
    post<{ path: string; name: string }>('create-folder', { bucket, parent, name }),

  remove: (bucket: string, items: { files?: string[]; folders?: string[] }) =>
    post<{ removed: number }>('delete', { bucket, files: items.files ?? [], folders: items.folders ?? [] }),

  deleteBucket: (bucket: string) => post<{ removed: number }>('delete-bucket', { bucket }),

  checkExisting: (bucket: string, paths: string[]) =>
    post<{ existing: string[] }>('check-existing', { bucket, paths }),

  signedUploadUrl: (bucket: string, path: string, upsert: boolean) =>
    post<{ token: string; path: string }>('signed-upload-url', { bucket, path, upsert }),
};

export interface RenameProgress {
  phase: 'preparing' | 'moving' | 'linking' | 'done';
  /** Known once the rename has been planned; needed to retry a failed step. */
  plan: RenamePlan | null;
  moved: number;
  total: number;
  failed: { path: string; error: string }[];
  /** Record links rewritten (known once linking finishes). */
  updated: number | null;
}

const BATCH_SIZE = 50;

/**
 * Moves the given objects in batches, reporting progress after each one.
 * Returns the paths that failed to move.
 */
async function moveObjects(
  bucket: string,
  plan: RenamePlan,
  paths: string[],
  report: (moved: number, failed: { path: string; error: string }[]) => void,
): Promise<{ path: string; error: string }[]> {
  const failed: { path: string; error: string }[] = [];
  let moved = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    try {
      const res = await post<{ moved: string[]; failed: { path: string; error: string }[] }>('rename-batch', {
        bucket,
        from: plan.from,
        to: plan.to,
        paths: batch,
      });
      moved += res.moved.length;
      failed.push(...res.failed);
    } catch (err) {
      // A whole batch the route refused or never answered: report each path.
      const error = err instanceof Error ? err.message : 'Move failed';
      failed.push(...batch.map((path) => ({ path, error })));
    }
    report(moved, [...failed]);
  }
  return failed;
}

/**
 * Renames a file or folder: plan, move every object in batches, then rewrite
 * the record links. Objects that fail to move are reported and their links
 * left alone, so nothing points at a file that isn't there.
 */
export async function renameStorageItem(options: {
  bucket: string;
  kind: 'file' | 'folder';
  path: string;
  name: string;
  onProgress: (progress: RenameProgress) => void;
}): Promise<{ plan: RenamePlan; failed: { path: string; error: string }[]; updated: number }> {
  const { bucket, kind, path, name, onProgress } = options;
  onProgress({ phase: 'preparing', plan: null, moved: 0, total: 0, failed: [], updated: null });

  const plan = await post<RenamePlan>('rename-start', { bucket, kind, path, name });
  const total = plan.objects.length;
  onProgress({ phase: 'moving', plan, moved: 0, total, failed: [], updated: null });

  const failed = await moveObjects(bucket, plan, plan.objects, (moved, failedSoFar) =>
    onProgress({ phase: 'moving', plan, moved, total, failed: failedSoFar, updated: null }),
  );

  const updated = await linkRenamed(bucket, kind, plan, failed, total, onProgress);
  return { plan, failed, updated };
}

/** Retries the objects that failed to move, then re-links. */
export async function retryRename(options: {
  bucket: string;
  kind: 'file' | 'folder';
  plan: RenamePlan;
  failed: { path: string; error: string }[];
  onProgress: (progress: RenameProgress) => void;
}): Promise<{ failed: { path: string; error: string }[]; updated: number }> {
  const { bucket, kind, plan, onProgress } = options;
  const total = plan.objects.length;
  const alreadyMoved = total - options.failed.length;
  const failed = await moveObjects(bucket, plan, options.failed.map((f) => f.path), (moved, failedSoFar) =>
    onProgress({ phase: 'moving', plan, moved: alreadyMoved + moved, total, failed: failedSoFar, updated: null }),
  );
  const updated = await linkRenamed(bucket, kind, plan, failed, total, onProgress);
  return { failed, updated };
}

/** Step 3 alone: rewrite record links (safe to repeat if it failed before). */
export async function linkRenamed(
  bucket: string,
  kind: 'file' | 'folder',
  plan: RenamePlan,
  failed: { path: string; error: string }[],
  total: number,
  onProgress: (progress: RenameProgress) => void,
): Promise<number> {
  const moved = total - failed.length;
  onProgress({ phase: 'linking', plan, moved, total, failed, updated: null });
  const { updated } = await post<{ updated: number }>('rename-finish', {
    bucket,
    kind,
    from: plan.from,
    to: plan.to,
    failed: failed.map((f) => f.path),
  });
  onProgress({ phase: 'done', plan, moved, total, failed, updated });
  return updated;
}
