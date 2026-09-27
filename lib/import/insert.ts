import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeForColumn } from './values';
import type { TableSchema } from './table-schema';
import type { ImportFailure, PreparedRow } from './types';

// Server-only: runs with the admin (service role) client.

const BATCH_SIZE = 500;

// Cap on the extra inserts spent narrowing a failed batch down to its bad rows,
// so a problem that hits every row can't run the request past its time limit.
const ISOLATION_BUDGET = 300;

interface DatabaseError {
  message?: string;
  code?: string;
}

/**
 * Postgres data errors (class 22) and constraint violations (class 23) come
 * from particular rows, so splitting the batch will find them. Anything else
 * (a missing column, permissions, a network drop) would fail every row alike.
 */
function isRowError(error: DatabaseError): boolean {
  return /^2[23]/.test(error.code ?? '');
}

/**
 * Readies mapped records for the table: each value becomes the JSON type its
 * column takes, and a blank in a NOT NULL column that has a default is left out
 * so the default fills it (e.g. `ocr_text NOT NULL DEFAULT ''` on older tables).
 * Pairs with insert(..., { defaultToNull: false }) below.
 */
export function normalizeRecords(prepared: PreparedRow[], schema: TableSchema): void {
  for (const { record } of prepared) {
    for (const column of Object.keys(record)) {
      const info = schema.columns[column];
      const value = normalizeForColumn(record[column], info?.type);
      if (value === null && info?.notNull && info.hasDefault) delete record[column];
      else record[column] = value;
    }
  }
}

/** Every slug already in the table, so new ones can't collide with them. */
export async function loadExistingSlugs(supabase: SupabaseClient, tableName: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(tableName)
      .select('slug')
      .order('id') // stable paging
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Couldn't read existing slugs: ${error.message}`);
    const rows = (data ?? []) as { slug: unknown }[];
    for (const { slug } of rows) if (typeof slug === 'string' && slug) slugs.add(slug);
    if (rows.length < pageSize) break;
  }
  return slugs;
}

/**
 * Inserts rows, and when the database rejects a batch, splits it in half until
 * the offending rows are isolated. The good rows still land, and only the rows
 * the database actually refused are reported.
 */
async function insertIsolating(
  supabase: SupabaseClient,
  tableName: string,
  rows: PreparedRow[],
  budget: { left: number },
): Promise<{ inserted: number; failed: { row: number; message: string }[] }> {
  const { error } = await supabase
    .from(tableName)
    .insert(
      rows.map((r) => r.record),
      { defaultToNull: false },
    );
  if (!error) return { inserted: rows.length, failed: [] };

  const message = error.message || error.code || 'Unknown database error';
  if (rows.length === 1 || !isRowError(error)) {
    return { inserted: 0, failed: rows.map((r) => ({ row: r.row, message })) };
  }
  if (budget.left < 2) {
    const note = `${message} (not narrowed down further, so some rows here may be fine)`;
    return { inserted: 0, failed: rows.map((r) => ({ row: r.row, message: note })) };
  }

  budget.left -= 2;
  const mid = Math.ceil(rows.length / 2);
  const first = await insertIsolating(supabase, tableName, rows.slice(0, mid), budget);
  const second = await insertIsolating(supabase, tableName, rows.slice(mid), budget);
  return {
    inserted: first.inserted + second.inserted,
    failed: [...first.failed, ...second.failed],
  };
}

/** Inserts every row in batches, returning what landed and what didn't (grouped by reason). */
export async function insertRows(
  supabase: SupabaseClient,
  tableName: string,
  rows: PreparedRow[],
): Promise<{ inserted: number; failures: ImportFailure[] }> {
  const budget = { left: ISOLATION_BUDGET };
  const rowsByMessage = new Map<string, number[]>();
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await insertIsolating(supabase, tableName, batch, budget);
    inserted += result.inserted;
    if (result.failed.length > 0) {
      console.error(`[import] ${tableName}: ${result.failed.length} of ${batch.length} rows failed in batch ${i / BATCH_SIZE + 1}`, {
        reasons: [...new Set(result.failed.map((f) => f.message))],
        sampleRecord: batch.find((r) => r.row === result.failed[0].row)?.record,
      });
    }
    for (const { row, message } of result.failed) {
      const list = rowsByMessage.get(message);
      if (list) list.push(row);
      else rowsByMessage.set(message, [row]);
    }
  }

  return {
    inserted,
    failures: [...rowsByMessage].map(([message, failedRows]) => ({ message, rows: failedRows })),
  };
}
