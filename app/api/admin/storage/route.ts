import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  LOCKED_BUCKETS,
  baseName,
  cleanFileStem,
  cleanStorageName,
  isSafeStoragePath,
  joinPath,
  parentOf,
  splitFileName,
} from '@/lib/storage/names';
import {
  folderExists,
  keepFolder,
  listAllObjects,
  listFolderPage,
  mapPool,
  objectExists,
  removeObjects,
  writeFolderPlaceholder,
} from '@/lib/storage/objects';
import {
  findReferences,
  referenceSources,
  rewriteReferences,
  summarizeReferences,
  type ReferenceTarget,
} from '@/lib/storage/references';
import type { RenamePlan, StorageBucket, StorageTargetKind } from '@/lib/storage/types';

// Deleting a bucket or renaming a big folder lists and moves thousands of
// objects; renames are batched by the browser, but deletes run in one call.
export const maxDuration = 300;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Where a rename or delete lands, as the reference finder sees it. */
function referenceTarget(bucket: string, path: string, kind: StorageTargetKind): ReferenceTarget {
  return { key: joinPath(bucket, path), exact: kind === 'file' };
}

// GET — buckets, one page of a folder, or what links into a file/folder/bucket.
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return bad('Forbidden', 403);

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const admin = createAdminClient();

  if (action === 'buckets') {
    const { data, error } = await admin.storage.listBuckets();
    if (error) return bad(error.message);
    const buckets: StorageBucket[] = (data || [])
      .map((b) => ({ name: b.name, public: b.public, locked: LOCKED_BUCKETS.has(b.name) }))
      .sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
    return NextResponse.json({ buckets });
  }

  const bucket = searchParams.get('bucket') || '';
  const path = searchParams.get('path') || searchParams.get('folder') || '';
  if (!bucket) return bad('bucket is required');
  if (!isSafeStoragePath(path)) return bad('Invalid path');

  if (action === 'list') {
    try {
      const listing = await listFolderPage(admin, bucket, path, searchParams.get('cursor') || undefined);
      return NextResponse.json(listing);
    } catch (err) {
      return bad(errorMessage(err, 'Could not list that folder'));
    }
  }

  if (action === 'references') {
    const kind = searchParams.get('kind') as StorageTargetKind | null;
    if (kind !== 'file' && kind !== 'folder' && kind !== 'bucket') return bad('kind must be file, folder or bucket');
    try {
      const sources = await referenceSources(admin);
      const hits = await findReferences(admin, sources, referenceTarget(bucket, kind === 'bucket' ? '' : path, kind));
      return NextResponse.json(summarizeReferences(hits));
    } catch (err) {
      return bad(errorMessage(err, 'Could not check which records link here'), 502);
    }
  }

  return bad('Unknown action');
}

// POST — every change: buckets, folders, deletes, renames and upload URLs.
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return bad('Forbidden', 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== 'string') return bad('action is required');
  const admin = createAdminClient();

  // Every action below except create-bucket works inside an existing bucket.
  const bucket = String(body.bucket ?? '').trim();
  if (body.action !== 'create-bucket') {
    if (!bucket) return bad('bucket is required');
    if (LOCKED_BUCKETS.has(bucket)) {
      return bad(`${bucket} is managed by the site (forum and family tree uploads) and can't be changed here.`, 403);
    }
  }

  // New buckets are always public: record pages link to files by their public URL.
  if (body.action === 'create-bucket') {
    const name = cleanStorageName(String(body.name || ''));
    if (!name) return bad('Enter a bucket name with at least one letter or number.');
    const { error } = await admin.storage.createBucket(name, { public: true });
    if (error) {
      if (/already exists/i.test(error.message)) return bad(`A bucket called “${name}” already exists.`, 409);
      return bad(error.message);
    }
    return NextResponse.json({ name });
  }

  if (body.action === 'create-folder') {
    const parent = String(body.parent || '');
    const name = cleanStorageName(String(body.name || ''));
    if (!isSafeStoragePath(parent)) return bad('Invalid parent folder');
    if (!name) return bad('Enter a folder name with at least one letter or number.');
    const path = joinPath(parent, name);
    try {
      if ((await folderExists(admin, bucket, path)) || (await objectExists(admin, bucket, path))) {
        return bad(`“${name}” already exists here.`, 409);
      }
      await writeFolderPlaceholder(admin, bucket, path);
    } catch (err) {
      return bad(errorMessage(err, 'Could not create the folder'));
    }
    return NextResponse.json({ path, name });
  }

  if (body.action === 'delete') {
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    const folders = Array.isArray(body.folders) ? body.folders.map(String) : [];
    if (files.length + folders.length === 0) return bad('Nothing to delete');
    if (![...files, ...folders].every((p: string) => p && isSafeStoragePath(p))) return bad('Invalid path');
    try {
      const paths = [...files];
      for (const folder of folders) paths.push(...(await listAllObjects(admin, bucket, folder)));
      const removed = await removeObjects(admin, bucket, [...new Set(paths)]);
      // Emptying a folder would otherwise make it vanish from the manager.
      for (const parent of new Set([...files, ...folders].map(parentOf))) await keepFolder(admin, bucket, parent);
      return NextResponse.json({ removed });
    } catch (err) {
      return bad(errorMessage(err, 'Delete failed'));
    }
  }

  if (body.action === 'delete-bucket') {
    try {
      const paths = await listAllObjects(admin, bucket, '');
      const removed = await removeObjects(admin, bucket, paths);
      const { error } = await admin.storage.deleteBucket(bucket);
      if (error) return bad(`Emptied ${removed} files, but the bucket itself couldn't be deleted: ${error.message}`);
      return NextResponse.json({ removed });
    } catch (err) {
      return bad(errorMessage(err, 'Could not delete the bucket'));
    }
  }

  // Rename, step 1: validate the new name and list everything that has to move.
  // Storage has no rename: each object is moved to its new key, in batches the
  // browser drives (step 2), then record links are rewritten (step 3).
  if (body.action === 'rename-start') {
    const kind = body.kind === 'file' ? 'file' : body.kind === 'folder' ? 'folder' : null;
    const from = String(body.path || '');
    if (!kind || !from || !isSafeStoragePath(from)) return bad('A file or folder path is required');

    let newName: string;
    if (kind === 'folder') {
      newName = cleanStorageName(String(body.name || ''));
    } else {
      // The extension stays as it was; only the name in front of it changes.
      const stem = cleanFileStem(String(body.name || ''));
      newName = stem ? stem + splitFileName(baseName(from)).ext : '';
    }
    if (!newName) return bad('Enter a name with at least one letter or number.');
    const to = joinPath(parentOf(from), newName);
    if (to === from) return bad('That’s already its name.');

    try {
      if ((await folderExists(admin, bucket, to)) || (await objectExists(admin, bucket, to))) {
        return bad(`“${newName}” already exists here.`, 409);
      }
      const objects = kind === 'folder' ? await listAllObjects(admin, bucket, from) : [from];
      if (kind === 'file' && !(await objectExists(admin, bucket, from))) return bad('That file no longer exists.', 404);
      if (objects.length === 0) return bad('That folder no longer exists.', 404);
      const plan: RenamePlan = { from, to, objects };
      return NextResponse.json(plan);
    } catch (err) {
      return bad(errorMessage(err, 'Could not prepare the rename'));
    }
  }

  // Rename, step 2: move one batch of objects from `from` to `to`.
  if (body.action === 'rename-batch') {
    const from = String(body.from || '');
    const to = String(body.to || '');
    const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
    if (!from || !to || !isSafeStoragePath(from) || !isSafeStoragePath(to) || parentOf(from) !== parentOf(to)) {
      return bad('Invalid rename');
    }
    if (paths.length === 0 || paths.length > 100) return bad('Send between 1 and 100 paths per batch');
    // Only objects under the renamed path can move, and only to the matching spot.
    if (!paths.every((p) => p === from || p.startsWith(`${from}/`))) return bad('A path is outside the item being renamed');

    const results = await mapPool(paths, 6, async (path) => {
      const destination = to + path.slice(from.length);
      const { error } = await admin.storage.from(bucket).move(path, destination);
      return { path, error: error?.message ?? null };
    });
    return NextResponse.json({
      moved: results.filter((r) => !r.error).map((r) => r.path),
      failed: results.filter((r) => r.error).map((r) => ({ path: r.path, error: r.error })),
    });
  }

  // Rename, step 3: point every record link at the new location. Safe to
  // retry: links already rewritten no longer match the old path.
  if (body.action === 'rename-finish') {
    const from = String(body.from || '');
    const to = String(body.to || '');
    const kind: StorageTargetKind = body.kind === 'file' ? 'file' : 'folder';
    const failed: string[] = Array.isArray(body.failed) ? body.failed.map(String) : [];
    if (!from || !to || !isSafeStoragePath(from) || !isSafeStoragePath(to)) return bad('Invalid rename');
    try {
      const sources = await referenceSources(admin);
      const hits = await findReferences(admin, sources, referenceTarget(bucket, from, kind));
      const skip = new Set(failed.map((p) => joinPath(bucket, p)));
      const updated = await rewriteReferences(admin, hits, joinPath(bucket, from), joinPath(bucket, to), skip);
      return NextResponse.json({ updated });
    } catch (err) {
      return bad(errorMessage(err, 'The files moved, but updating record links failed'), 502);
    }
  }

  // Which of these destination paths already hold a file (to flag before an upload overwrites them).
  if (body.action === 'check-existing') {
    const paths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
    if (paths.length > 1000) return bad('Check at most 1000 files at a time');
    if (!paths.every((p) => p && isSafeStoragePath(p))) return bad('Invalid path');
    const found = await mapPool(paths, 8, async (path) => ((await objectExists(admin, bucket, path)) ? path : null));
    return NextResponse.json({ existing: found.filter(Boolean) });
  }

  // A short-lived signed URL so the browser uploads straight to Storage,
  // bypassing the serverless request-body limit for big scans.
  if (body.action === 'signed-upload-url') {
    const path = String(body.path || '').trim();
    if (!path || !isSafeStoragePath(path)) return bad('A valid path is required');
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: body.upsert === true });
    if (error || !data) return bad(error?.message || 'Could not create upload URL');
    return NextResponse.json({ token: data.token, path: data.path });
  }

  return bad('Unknown action');
}
