import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllTableColumns } from '@/lib/import/table-schema';

// Server-only: reads and drops tables with the service-role client.

/**
 * Records tables no collection uses any more: left behind when a collection
 * was deleted without its table, or kept as _legacy / _backup copies during
 * earlier reorganizations. Admin → Collections → Unused tables lists them so
 * they can be checked and removed. A leftover table also blocks importing a
 * new collection under the same name, which the import wizard offers to fix.
 */

// Tables the site itself uses. Never listed or dropped, whatever their shape.
const NEVER_DROP: ReadonlySet<string> = new Set([
  'collections',
  'profiles',
  'record_citations',
  'related_records',
  'bookmarks',
  'blurred_scans',
  'forum_threads',
  'forum_categories',
]);

// Import-made table names are lowercase with underscores; a few older ones
// carry hyphens. Always double-quoted in SQL.
const TABLE_NAME = /^[a-z0-9_-]+$/i;

export interface UnusedTable {
  name: string;
  rows: number | null;
  /** created_at of the newest row, when the table has that column. */
  newestRow: string | null;
  columns: string[];
  /** backup: _backup_<date> copy; legacy: _legacy copy; leftover: anything else. */
  kind: 'backup' | 'legacy' | 'leftover';
  /** Related-records links and citation overrides that point at it (removed with it). */
  links: number;
}

/** Shaped like a collection's records table: what the import (and older migrations) create. */
function looksLikeRecordsTable(columns: Set<string>): boolean {
  return columns.has('id') && columns.has('slug') && (columns.has('image_path') || columns.has('ocr_text'));
}

async function tablesInUse(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from('collections').select('table_name');
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((c) => c.table_name).filter((t): t is string => !!t));
}

async function linkCount(admin: SupabaseClient, table: string): Promise<number> {
  const [related, citations] = await Promise.all([
    admin
      .from('related_records')
      .select('id', { count: 'exact', head: true })
      .or(`source_table.eq.${table},target_table.eq.${table}`),
    admin.from('record_citations').select('id', { count: 'exact', head: true }).eq('table_name', table),
  ]);
  return (related.count ?? 0) + (citations.count ?? 0);
}

/**
 * Why a table can't be dropped as unused, or null when it can. Checked fresh
 * right before every drop, since a collection may have been pointed at it since
 * the list was loaded.
 */
export async function whyNotDroppable(admin: SupabaseClient, table: string): Promise<string | null> {
  if (!TABLE_NAME.test(table)) return 'That isn’t a valid table name.';
  if (NEVER_DROP.has(table)) return `${table} is used by the site itself.`;
  const columns = (await fetchAllTableColumns()).get(table);
  if (!columns) return `There's no table named ${table}.`;
  if (!looksLikeRecordsTable(columns)) return `${table} isn't a collection's records table.`;
  if ((await tablesInUse(admin)).has(table)) return `${table} is still used by a collection.`;
  return null;
}

export async function listUnusedTables(admin: SupabaseClient): Promise<UnusedTable[]> {
  const [all, inUse] = await Promise.all([fetchAllTableColumns(), tablesInUse(admin)]);
  const candidates = [...all.entries()]
    .filter(([name, columns]) => TABLE_NAME.test(name) && !NEVER_DROP.has(name) && !inUse.has(name) && looksLikeRecordsTable(columns))
    .sort(([a], [b]) => a.localeCompare(b));

  return Promise.all(
    candidates.map(async ([name, columns]) => {
      const [count, newest, links] = await Promise.all([
        admin.from(name).select('*', { count: 'exact', head: true }),
        columns.has('created_at')
          ? admin.from(name).select('created_at').order('created_at', { ascending: false, nullsFirst: false }).limit(1)
          : Promise.resolve({ data: null }),
        linkCount(admin, name),
      ]);
      const newestRow = (newest.data as { created_at?: string }[] | null)?.[0]?.created_at ?? null;
      return {
        name,
        rows: count.error ? null : count.count ?? null,
        newestRow,
        columns: [...columns],
        kind: /_backup_\d/.test(name) ? 'backup' : /_legacy$/.test(name) ? 'legacy' : 'leftover',
        links,
      } satisfies UnusedTable;
    }),
  );
}

/** A few rows of an unused table, long values cut short, so an admin can see what it holds. */
export async function peekTable(admin: SupabaseClient, table: string, limit = 3) {
  const { data, error } = await admin.from(table).select('*').limit(limit);
  if (error) throw new Error(error.message);
  const cut = (v: unknown) => {
    const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  };
  return ((data ?? []) as Record<string, unknown>[]).map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([k]) => k !== 'embedding' && k !== 'tsv')
        .map(([k, v]) => [k, cut(v)]),
    ),
  );
}

/**
 * Drops an unused table, then clears the related-records links and citation
 * overrides that pointed at it. No CASCADE: if anything else depends on the
 * table (a view, say), Postgres refuses and the reason is returned.
 */
export async function dropUnusedTable(admin: SupabaseClient, table: string): Promise<string | null> {
  const reason = await whyNotDroppable(admin, table);
  if (reason) return reason;

  const { error } = await admin.rpc('exec_sql', {
    sql_text: `DROP TABLE IF EXISTS public."${table}"; NOTIFY pgrst, 'reload schema';`,
  });
  if (error) return `The table couldn't be removed: ${error.message}`;

  await admin.from('record_citations').delete().eq('table_name', table);
  await admin.from('related_records').delete().or(`source_table.eq.${table},target_table.eq.${table}`);
  // PostgREST reloads its schema asynchronously; give it a moment so the next
  // read (the import wizard re-checks straight away) no longer sees the table.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return null;
}
