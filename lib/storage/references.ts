import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchColumnNames } from '@/lib/import/table-schema';
import { mapPool } from './objects';
import type { StorageReferenceSummary } from './types';

// Server-only: reads and rewrites collection tables with the service-role
// client. Never import from a client component.

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const SAFE_IDENTIFIER = /^[a-z0-9_]+$/i;

/** A column the site reads storage links from. */
export interface ReferenceSource {
  table: string;
  column: string;
  /** Who uses it, for the admin: collection names, or "Collection cover images". */
  label: string;
}

/** The rows of one source whose link points at the target. */
export interface ReferenceHit {
  source: ReferenceSource;
  rows: { id: string; value: string }[];
}

/** Where a rename or delete applies: one file, or everything under a folder or bucket. */
export interface ReferenceTarget {
  /** "bucket/path/to/file.jpg", "bucket/folder", or just "bucket". */
  key: string;
  exact: boolean;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // a stray "%" — compare it as written
  }
}

/**
 * The storage object ("bucket/path") a stored link points at, or null when it
 * isn't a link into this project's storage. Links come in three shapes:
 * "bucket/path", a full public URL (raw or percent-encoded), or a bare
 * filename. A bare filename names no bucket, so it can't be matched.
 */
export function referenceKey(value: string): string | null {
  if (/^https?:\/\//i.test(value)) {
    const at = value.indexOf(OBJECT_SEGMENT);
    if (at === -1 || value.slice(0, at) !== process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const path = value.slice(at + OBJECT_SEGMENT.length).split(/[?#]/)[0];
    return path.split('/').map(safeDecode).join('/');
  }
  if (!value.includes('/')) return null;
  return value.replace(/^\/+/, '');
}

function matches(key: string | null, target: ReferenceTarget): boolean {
  if (!key) return false;
  return target.exact ? key === target.key : key.startsWith(`${target.key}/`);
}

/**
 * The same link pointing somewhere new, written in the shape it already had.
 * Path segments are swapped one for one, so an encoded URL stays encoded and a
 * "bucket/path" value stays bare. Assumes `referenceKey(value)` is `fromKey` or
 * sits under it.
 */
export function rewriteValue(value: string, fromKey: string, toKey: string): string {
  const replaced = fromKey.split('/').length;
  const toSegments = toKey.split('/');

  if (/^https?:\/\//i.test(value)) {
    const at = value.indexOf(OBJECT_SEGMENT) + OBJECT_SEGMENT.length;
    const [, path, suffix] = value.slice(at).match(/^([^?#]*)([\s\S]*)$/)!;
    const encoded = /%[0-9a-f]{2}/i.test(path);
    const segments = path.split('/');
    const next = [...toSegments.map((s) => (encoded ? encodeURIComponent(s) : s)), ...segments.slice(replaced)];
    return value.slice(0, at) + next.join('/') + suffix;
  }

  const lead = value.match(/^\/*/)![0];
  const segments = value.slice(lead.length).split('/');
  return lead + [...toSegments, ...segments.slice(replaced)].join('/');
}

/**
 * Every column the site reads storage links from: each collection table's
 * image_path (the record scans) and the collections' cover images.
 */
export async function referenceSources(admin: SupabaseClient): Promise<ReferenceSource[]> {
  const { data, error } = await admin.from('collections').select('name, table_name').not('table_name', 'is', null);
  if (error) throw new Error(error.message);

  const namesByTable = new Map<string, string[]>();
  for (const c of data || []) {
    if (!c.table_name || !SAFE_IDENTIFIER.test(c.table_name)) continue;
    namesByTable.set(c.table_name, [...(namesByTable.get(c.table_name) ?? []), c.name]);
  }

  // A few older tables have no image_path, and rows are rewritten by id.
  const columns = await fetchColumnNames([...namesByTable.keys()]);
  const sources: ReferenceSource[] = [];
  for (const [table, names] of namesByTable) {
    const cols = columns.get(table);
    if (!cols?.has('image_path') || !cols.has('id')) continue;
    const label = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
    sources.push({ table, column: 'image_path', label });
  }
  sources.push({ table: 'collections', column: 'thumbnail_url', label: 'Collection cover images' });
  return sources;
}

// Characters no URL encoder touches, so they read the same in a bare path, a
// raw URL and a percent-encoded one.
const VERBATIM_PREFIX = /^[A-Za-z0-9\-_.!~'()/]*/;

/**
 * Rows linking to the target. A LIKE scan on the part of the key every
 * encoding writes the same way narrows each table to candidates (it
 * over-matches, which is fine), then every candidate is decoded and compared
 * exactly.
 */
export async function findReferences(
  admin: SupabaseClient,
  sources: ReferenceSource[],
  target: ReferenceTarget,
): Promise<ReferenceHit[]> {
  const needle = target.key.match(VERBATIM_PREFIX)![0];

  const hits = await mapPool(sources, 6, async (source) => {
    const rows: { id: string; value: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from(source.table)
        .select(`id, ${source.column}`)
        .like(source.column, `%${needle}%`)
        .order('id')
        .range(from, from + 999);
      if (error) throw new Error(`${source.table}: ${error.message}`);
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of page) {
        const value = row[source.column];
        if (typeof value === 'string' && matches(referenceKey(value), target)) rows.push({ id: String(row.id), value });
      }
      if (page.length < 1000) break;
    }
    return { source, rows };
  });

  return hits.filter((h) => h.rows.length > 0);
}

export function summarizeReferences(hits: ReferenceHit[]): StorageReferenceSummary {
  const sources = hits
    .map((h) => ({ label: h.source.label, table: h.source.table, count: h.rows.length }))
    .sort((a, b) => b.count - a.count);
  return { total: sources.reduce((n, s) => n + s.count, 0), sources };
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Points every hit at its new location. `skipKeys` holds objects that failed
 * to move: links to those are left alone so they keep working. Each statement
 * re-checks the old value, so a row edited in the meantime isn't clobbered.
 * Returns how many links were rewritten.
 */
export async function rewriteReferences(
  admin: SupabaseClient,
  hits: ReferenceHit[],
  fromKey: string,
  toKey: string,
  skipKeys: ReadonlySet<string> = new Set(),
): Promise<number> {
  let rewritten = 0;
  for (const { source, rows } of hits) {
    if (!SAFE_IDENTIFIER.test(source.table) || !SAFE_IDENTIFIER.test(source.column)) continue;
    const updates = rows
      .filter((r) => !skipKeys.has(referenceKey(r.value) ?? ''))
      .map((r) => ({ id: r.id, old: r.value, next: rewriteValue(r.value, fromKey, toKey) }));

    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      const values = chunk.map((u) => `(${quote(u.id)}, ${quote(u.old)}, ${quote(u.next)})`).join(',\n');
      const sql = `UPDATE public."${source.table}" AS r SET "${source.column}" = m.next_value
        FROM (VALUES ${values}) AS m(id, old_value, next_value)
        WHERE r.id::text = m.id AND r."${source.column}" = m.old_value;`;
      const { error } = await admin.rpc('exec_sql', { sql_text: sql });
      if (error) throw new Error(`Updating links in ${source.table} failed: ${error.message}`);
      rewritten += chunk.length;
    }
  }
  return rewritten;
}
