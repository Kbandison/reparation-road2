import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPdfPath } from '@/lib/collections/helpers';
import { BLURRED_BUCKET, blurredKeyFor, restrictedKeyFor } from '@/lib/collections/blur';
import { fetchColumnNames } from '@/lib/import/table-schema';
import { objectExists } from '@/lib/storage/objects';
import {
  findReferences,
  referenceKey,
  referenceSources,
  rewriteReferences,
  type ReferenceHit,
  type ReferenceSource,
} from '@/lib/storage/references';

/**
 * Blurs a collection's scans, or restores them (see lib/collections/blur.ts).
 *
 * The blurring itself happens in the admin's browser (lib/images/blur-scan.ts);
 * this route hands out signed URLs for each original and its blurred copy,
 * then, once a copy is uploaded, points every link at it and moves the
 * original into the private bucket. Work goes in small batches the browser
 * drives, so no request runs long.
 *
 * GET  ?collection=slug                    status: scans waiting, blurred, stuck
 * POST { action: 'enable' | 'disable' }    the collection's blur_images switch
 * POST { action: 'prepare', keys }         signed download + upload URLs
 * POST { action: 'commit', keys }          relink to the copies, hide the originals
 * POST { action: 'retry-moves' }           re-try originals that didn't move
 * POST { action: 'restore' }               undo a batch: originals back, copies gone
 */

export const maxDuration = 300;

const SAFE_IDENTIFIER = /^[a-z0-9_]+$/i;
const MAX_BATCH = 20;
// Signed URLs only need to outlive one batch in the browser.
const URL_LIFETIME_SECONDS = 60 * 30;
// Width the browser downloads images at. The blur shrinks them to ~100px
// anyway, so there's no point fetching a 30 MB original.
const DOWNLOAD_WIDTH = 1600;

interface BlurCollection {
  id: string;
  slug: string;
  name: string;
  table_name: string | null;
  discriminator_column: string | null;
  discriminator_value: string | null;
  blur_images: boolean | null;
}

interface BlurredScanRow {
  id: string;
  original_key: string;
  blurred_key: string;
  restricted_key: string | null;
}

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

const splitKey = (key: string) => {
  const slash = key.indexOf('/');
  return { bucket: key.slice(0, slash), path: key.slice(slash + 1) };
};
const parentKey = (key: string) => key.slice(0, key.lastIndexOf('/'));
const kindOf = (key: string): 'image' | 'pdf' => (isPdfPath(key) ? 'pdf' : 'image');

const NEEDS_MIGRATION =
  'Blurred images need a one-time database update first: run image_blur_migration.sql in the Supabase SQL editor.';

/** The collection, or the response to send instead (not found, or the migration hasn't run). */
async function loadCollection(admin: SupabaseClient, slug: unknown): Promise<BlurCollection | NextResponse> {
  if (typeof slug !== 'string' || !slug) return fail('collection is required');
  const { data, error } = await admin
    .from('collections')
    .select('id, slug, name, table_name, discriminator_column, discriminator_value, blur_images')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return error.message.includes('blur_images') ? fail(NEEDS_MIGRATION, 503) : fail(error.message, 502);
  if (!data) return fail('Collection not found', 404);
  const collection = data as BlurCollection;
  if (!collection.table_name || !SAFE_IDENTIFIER.test(collection.table_name)) {
    return fail('This collection has no records table, so it has no images to blur.');
  }
  return collection;
}

/** The scan columns a table has: image_path, and image_url on a few older tables. */
async function scanColumns(table: string): Promise<string[]> {
  const columns = (await fetchColumnNames([table])).get(table);
  return ['image_path', 'image_url'].filter((c) => columns?.has(c));
}

/**
 * Every distinct scan the collection's records link to, as "bucket/path" keys,
 * plus how many links aren't into this project's storage (bare filenames or
 * outside URLs), which can't be blurred.
 */
async function collectionScanKeys(admin: SupabaseClient, collection: BlurCollection) {
  const table = collection.table_name!;
  const columns = await scanColumns(table);
  const keys = new Set<string>();
  let unreachable = 0;
  if (columns.length === 0) return { keys, unreachable };

  for (let from = 0; ; from += 1000) {
    let query = admin.from(table).select(['id', ...columns].join(', '));
    if (collection.discriminator_column && collection.discriminator_value) {
      query = query.ilike(collection.discriminator_column, collection.discriminator_value);
    }
    const { data, error } = await query.order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      for (const column of columns) {
        const value = typeof row[column] === 'string' ? (row[column] as string).trim() : '';
        if (!value) continue;
        const key = referenceKey(value);
        if (key && key.includes('/')) keys.add(key);
        else unreachable++;
      }
    }
    if (rows.length < 1000) break;
  }
  return { keys, unreachable };
}

/** Where the site reads scan links from, plus this collection's image_url column if it has one. */
async function linkSources(admin: SupabaseClient, collection: BlurCollection): Promise<ReferenceSource[]> {
  const sources = await referenceSources(admin);
  if ((await scanColumns(collection.table_name!)).includes('image_url')) {
    sources.push({ table: collection.table_name!, column: 'image_url', label: collection.name });
  }
  return sources;
}

/** Links to each key, found with one scan per folder rather than one per file. */
async function hitsByKey(admin: SupabaseClient, sources: ReferenceSource[], keys: string[]) {
  const result = new Map<string, ReferenceHit[]>();
  const folders = [...new Set(keys.map(parentKey))];
  for (const folder of folders) {
    const hits = await findReferences(admin, sources, { key: folder, exact: false });
    for (const key of keys.filter((k) => parentKey(k) === folder)) {
      result.set(
        key,
        hits
          .map((h) => ({ source: h.source, rows: h.rows.filter((r) => referenceKey(r.value) === key) }))
          .filter((h) => h.rows.length > 0),
      );
    }
  }
  return result;
}

async function moveObject(admin: SupabaseClient, fromKey: string, toKey: string): Promise<string | null> {
  const from = splitKey(fromKey);
  const to = splitKey(toKey);
  const { error } = await admin.storage.from(from.bucket).move(from.path, to.path, { destinationBucket: to.bucket });
  return error ? error.message : null;
}

/**
 * Moves an original into the private bucket. Already there (an earlier run
 * moved it) counts as done. Returns where it's kept, or why it isn't hidden.
 */
async function hideOriginal(
  admin: SupabaseClient,
  key: string,
): Promise<{ restrictedKey: string; error: null } | { restrictedKey: null; error: string }> {
  const restrictedKey = restrictedKeyFor(key);
  const original = splitKey(key);
  if (await objectExists(admin, original.bucket, original.path)) {
    const error = await moveObject(admin, key, restrictedKey);
    return error ? { restrictedKey: null, error } : { restrictedKey, error: null };
  }
  const kept = splitKey(restrictedKey);
  if (await objectExists(admin, kept.bucket, kept.path)) return { restrictedKey, error: null };
  return { restrictedKey: null, error: 'The original file is missing from storage.' };
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const admin = createAdminClient();
  const collection = await loadCollection(admin, new URL(request.url).searchParams.get('collection'));
  if (collection instanceof NextResponse) return collection;

  try {
    const { keys, unreachable } = await collectionScanKeys(admin, collection);
    const { data: rows, error } = await admin
      .from('blurred_scans')
      .select('id, original_key, blurred_key, restricted_key')
      .eq('collection_id', collection.id);
    if (error) return error.message.includes('blurred_scans') ? fail(NEEDS_MIGRATION, 503) : fail(error.message, 502);

    const all = [...keys];
    const pending = all.filter((k) => !k.startsWith(`${BLURRED_BUCKET}/`)).sort();
    return NextResponse.json({
      blurImages: collection.blur_images === true,
      totalScans: all.length,
      blurred: all.length - pending.length,
      pending,
      // Blurred, but the original is still in its public bucket.
      stuck: ((rows ?? []) as BlurredScanRow[]).filter((r) => !r.restricted_key).length,
      restorable: (rows ?? []).length,
      unreachable,
    });
  } catch (err) {
    console.error('[image-blur] status failed', collection.slug, err);
    return fail(err instanceof Error ? err.message : 'Could not read the collection’s images', 502);
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const admin = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    collection?: string;
    keys?: unknown;
  };
  const collection = await loadCollection(admin, body.collection);
  if (collection instanceof NextResponse) return collection;

  const setSwitch = async (on: boolean) => {
    const { error } = await admin
      .from('collections')
      .update({ blur_images: on, updated_at: new Date().toISOString() })
      .eq('id', collection.id);
    return error ? fail(error.message) : NextResponse.json({ success: true, blurImages: on });
  };

  // Switching on first means pages stop showing the originals (as "being
  // prepared") right away, before any copy exists.
  if (body.action === 'enable') return setSwitch(true);

  if (body.action === 'disable') {
    const { count, error } = await admin
      .from('blurred_scans')
      .select('id', { count: 'exact', head: true })
      .eq('collection_id', collection.id);
    if (error) return fail(error.message);
    if (count) return fail(`Restore the ${count} blurred image${count === 1 ? '' : 's'} first.`);
    return setSwitch(false);
  }

  // The keys the browser sends back must be scans this collection actually uses.
  const requestedKeys = async (): Promise<string[] | NextResponse> => {
    const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === 'string') : [];
    if (keys.length === 0 || keys.length > MAX_BATCH) return fail(`Send 1 to ${MAX_BATCH} images at a time.`);
    const { keys: known } = await collectionScanKeys(admin, collection);
    const unknown = keys.filter((k) => !known.has(k) || k.startsWith(`${BLURRED_BUCKET}/`) || !k.includes('/'));
    if (unknown.length) return fail(`Not an unblurred image in ${collection.name}: ${unknown[0]}`);
    return keys;
  };

  if (body.action === 'prepare') {
    const keys = await requestedKeys();
    if (keys instanceof NextResponse) return keys;

    const items = await Promise.all(
      keys.map(async (key) => {
        const kind = kindOf(key);
        const original = splitKey(key);
        const blurred = splitKey(blurredKeyFor(key, kind));
        const bucket = admin.storage.from(original.bucket);
        // Images come through the resize endpoint (far smaller); oversize
        // scans make it fail, so the raw file is offered as a fallback.
        const [raw, resized, upload] = await Promise.all([
          bucket.createSignedUrl(original.path, URL_LIFETIME_SECONDS),
          kind === 'image'
            ? bucket.createSignedUrl(original.path, URL_LIFETIME_SECONDS, {
                transform: { width: DOWNLOAD_WIDTH, resize: 'contain', quality: 80 },
              })
            : Promise.resolve(null),
          admin.storage.from(BLURRED_BUCKET).createSignedUploadUrl(blurred.path, { upsert: true }),
        ]);
        if (raw.error || !raw.data) return { key, error: `The original can’t be read: ${raw.error?.message ?? 'not found'}` };
        if (upload.error || !upload.data) return { key, error: `No upload slot for the copy: ${upload.error?.message}` };
        return {
          key,
          kind,
          downloadUrl: resized?.data?.signedUrl ?? raw.data.signedUrl,
          fallbackUrl: raw.data.signedUrl,
          upload: { bucket: BLURRED_BUCKET, path: upload.data.path, token: upload.data.token },
        };
      }),
    );
    return NextResponse.json({ items });
  }

  if (body.action === 'commit') {
    const keys = await requestedKeys();
    if (keys instanceof NextResponse) return keys;

    try {
      const sources = await linkSources(admin, collection);
      const hits = await hitsByKey(admin, sources, keys);
      const results: { key: string; ok: boolean; error?: string; alsoUsedBy?: string[]; originalHidden?: boolean }[] = [];

      for (const key of keys) {
        const blurredKey = blurredKeyFor(key, kindOf(key));
        const copy = splitKey(blurredKey);
        if (!(await objectExists(admin, copy.bucket, copy.path))) {
          results.push({ key, ok: false, error: 'The blurred copy never arrived. Run the blur again.' });
          continue;
        }

        // 1. Every link (this collection's records, any other collection's,
        //    cover images) now points at the copy, so nothing shows the original.
        const keyHits = hits.get(key) ?? [];
        await rewriteReferences(admin, keyHits, key, blurredKey);
        const alsoUsedBy = keyHits
          .filter((h) => !(h.source.table === collection.table_name))
          .map((h) => h.source.label);

        // 2. The original leaves public view. If this fails the links are
        //    already safe; the admin page offers a retry.
        const hidden = await hideOriginal(admin, key);

        const { error } = await admin.from('blurred_scans').upsert(
          {
            collection_id: collection.id,
            original_key: key,
            blurred_key: blurredKey,
            restricted_key: hidden.restrictedKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'original_key' },
        );
        if (error) throw new Error(`Saving the record of ${key} failed: ${error.message}`);
        if (hidden.error) console.error('[image-blur] original not hidden', key, hidden.error);
        results.push({
          key,
          ok: true,
          originalHidden: !hidden.error,
          ...(hidden.error && { error: `Blurred, but the original isn't hidden yet: ${hidden.error}` }),
          ...(alsoUsedBy.length && { alsoUsedBy }),
        });
      }
      return NextResponse.json({ results });
    } catch (err) {
      console.error('[image-blur] commit failed', collection.slug, err);
      return fail(err instanceof Error ? err.message : 'Relinking failed', 502);
    }
  }

  if (body.action === 'retry-moves') {
    const { data, error } = await admin
      .from('blurred_scans')
      .select('id, original_key, blurred_key, restricted_key')
      .eq('collection_id', collection.id)
      .is('restricted_key', null)
      .limit(MAX_BATCH);
    if (error) return fail(error.message);
    let moved = 0;
    const errors: string[] = [];
    for (const row of (data ?? []) as BlurredScanRow[]) {
      const hidden = await hideOriginal(admin, row.original_key);
      if (hidden.error) {
        errors.push(`${row.original_key}: ${hidden.error}`);
        continue;
      }
      const { error: saveError } = await admin
        .from('blurred_scans')
        .update({ restricted_key: hidden.restrictedKey, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (saveError) errors.push(`${row.original_key}: ${saveError.message}`);
      else moved++;
    }
    return NextResponse.json({ moved, errors });
  }

  if (body.action === 'restore') {
    const { data, error } = await admin
      .from('blurred_scans')
      .select('id, original_key, blurred_key, restricted_key')
      .eq('collection_id', collection.id)
      .order('original_key')
      .limit(MAX_BATCH);
    if (error) return fail(error.message);
    const rows = (data ?? []) as BlurredScanRow[];

    try {
      const sources = await linkSources(admin, collection);
      const hits = await hitsByKey(admin, sources, rows.map((r) => r.blurred_key));
      const errors: string[] = [];
      let restored = 0;

      for (const row of rows) {
        // 1. The original goes back where it was (unless it never left).
        if (row.restricted_key) {
          const moveError = await moveObject(admin, row.restricted_key, row.original_key);
          if (moveError) {
            errors.push(`${row.original_key}: ${moveError}`);
            continue;
          }
        }
        // 2. Links point at the original again, then the copy goes.
        await rewriteReferences(admin, hits.get(row.blurred_key) ?? [], row.blurred_key, row.original_key);
        const copy = splitKey(row.blurred_key);
        await admin.storage.from(copy.bucket).remove([copy.path]);
        const { error: deleteError } = await admin.from('blurred_scans').delete().eq('id', row.id);
        if (deleteError) throw new Error(deleteError.message);
        restored++;
      }

      const { count } = await admin
        .from('blurred_scans')
        .select('id', { count: 'exact', head: true })
        .eq('collection_id', collection.id);
      return NextResponse.json({ restored, remaining: count ?? 0, errors });
    } catch (err) {
      console.error('[image-blur] restore failed', collection.slug, err);
      return fail(err instanceof Error ? err.message : 'Restoring failed', 502);
    }
  }

  return fail('Unknown action');
}
