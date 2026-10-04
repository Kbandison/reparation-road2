import type { SupabaseClient } from '@supabase/supabase-js';
import { FOLDER_PLACEHOLDER, joinPath } from './names';
import type { StorageFile, StorageFolder, StorageListing } from './types';

// Server-only: expects the service-role client. Never import from a client component.

const OBJECT_SEGMENT = '/storage/v1/object/public/';

/** Public URL of an object, each path segment encoded so spaces and parentheses survive. */
export function publicObjectUrl(bucket: string, path: string): string {
  const encoded = joinPath(bucket, path).split('/').map(encodeURIComponent).join('/');
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${OBJECT_SEGMENT}${encoded}`;
}

const prefixFor = (folder: string) => (folder ? `${folder}/` : '');

/**
 * One page of a folder: its sub-folders and files, in name order. listV2
 * returns folders and files separately and pages with a cursor, so a folder
 * with thousands of scans never silently stops at a fixed limit.
 *
 * Note: listV2 entries carry the full key in `name` (the typings say otherwise),
 * so names are cut from the key here rather than read from `key`.
 */
export async function listFolderPage(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
  cursor?: string,
  limit = 200,
): Promise<StorageListing> {
  const prefix = prefixFor(folder);
  const { data, error } = await admin.storage.from(bucket).listV2({
    prefix,
    limit,
    cursor,
    with_delimiter: true,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error(error.message);

  const folders: StorageFolder[] = (data.folders || []).map((f) => {
    const path = f.name.replace(/\/+$/, '');
    return { name: path.slice(prefix.length), path };
  });

  const files: StorageFile[] = (data.objects || [])
    .filter((o) => !o.name.endsWith(`/${FOLDER_PLACEHOLDER}`) && o.name !== FOLDER_PLACEHOLDER)
    .map((o) => ({
      name: o.name.slice(prefix.length),
      path: o.name,
      size: typeof o.metadata?.size === 'number' ? o.metadata.size : null,
      mimetype: typeof o.metadata?.mimetype === 'string' ? o.metadata.mimetype : null,
      updatedAt: o.updated_at ?? null,
      url: publicObjectUrl(bucket, o.name),
    }));

  return { folders, files, nextCursor: data.hasNext && data.nextCursor ? data.nextCursor : null };
}

/**
 * Every object under a folder, at any depth, including folder placeholders.
 * An empty `folder` lists the whole bucket. No cap: rename and delete must see
 * every file, not a sample.
 */
export async function listAllObjects(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const { data, error } = await admin.storage.from(bucket).listV2({ prefix: prefixFor(folder), limit: 1000, cursor });
    if (error) throw new Error(error.message);
    for (const o of data.objects || []) paths.push(o.name);
    cursor = data.hasNext && data.nextCursor ? data.nextCursor : undefined;
  } while (cursor);
  return paths;
}

/** True when anything at all (a file, a sub-folder, or a placeholder) lives under the folder. */
export async function folderExists(admin: SupabaseClient, bucket: string, folder: string): Promise<boolean> {
  const { data, error } = await admin.storage.from(bucket).listV2({ prefix: prefixFor(folder), limit: 1 });
  if (error) throw new Error(error.message);
  return (data.objects?.length ?? 0) > 0;
}

/** True when an object exists at exactly this path. */
export async function objectExists(admin: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  // exists() answers a missing object with an error object as well as `false`.
  const { data } = await admin.storage.from(bucket).exists(path);
  return data === true;
}

/** Creates (or re-creates) the hidden file that keeps a folder in existence. */
export async function writeFolderPlaceholder(admin: SupabaseClient, bucket: string, folder: string): Promise<void> {
  const { error } = await admin.storage
    .from(bucket)
    .upload(joinPath(folder, FOLDER_PLACEHOLDER), new Blob([]), { contentType: 'text/plain', upsert: true });
  if (error) throw new Error(error.message);
}

/**
 * Storage folders vanish the moment their last file goes. A file manager that
 * makes a folder disappear when you empty it is confusing, so emptied folders
 * get their placeholder back.
 */
export async function keepFolder(admin: SupabaseClient, bucket: string, folder: string): Promise<void> {
  if (!folder) return; // the bucket root always exists
  if (!(await folderExists(admin, bucket, folder))) await writeFolderPlaceholder(admin, bucket, folder);
}

/** Deletes objects in chunks (the remove endpoint takes a bounded list per call). Returns how many went. */
export async function removeObjects(admin: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const { data, error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(error.message);
    removed += data?.length ?? 0;
  }
  return removed;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

