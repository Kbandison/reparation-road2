/**
 * "Add a column to existing records": matches spreadsheet rows to records
 * already in a collection, and works out which values to write. Pure logic,
 * safe on the server or in the browser.
 */

/** Columns the site manages itself; never filled from a spreadsheet here. */
export const RESERVED_COLUMNS: ReadonlySet<string> = new Set([
  'id',
  'slug',
  'image_path',
  'image_url',
  'ocr_text',
  'created_at',
  'updated_at',
  'embedding',
  'tsv',
  'collection_tag',
]);

/** A safe Postgres column name from a header ("Source Link" → "source_link"), or null. */
export function cleanColumnName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return /^[a-z][a-z0-9_]{0,62}$/.test(name) ? name : null;
}

/**
 * How a key value is compared: case, accents written as composed characters,
 * and runs of spaces don't matter ("John  SMITH " = "john smith").
 */
export function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface RecordKeys {
  id: string;
  /** The record's values in the matched table columns, in pair order. */
  values: string[];
}

export interface ColumnPlan {
  /** One write per record. */
  updates: { id: string; value: string | null }[];
  /** Spreadsheet row numbers (header = 1) by outcome. */
  unmatched: number[];
  /** The row's key fits more than one record, so it can't say which. */
  ambiguous: number[];
  /** Rows that reach the same record with different values. None of them is written. */
  conflicting: number[];
  /** Rows whose key cells are all empty. */
  blankKey: number[];
  /** Matched rows with an empty value, left alone because blanks are skipped. */
  skippedBlank: number;
  /** Records no spreadsheet row reached. */
  recordsUntouched: number;
}

export function planColumnUpdates(input: {
  rows: Record<string, unknown>[];
  rowNumbers: number[];
  /** Spreadsheet headers to match on, paired in order with the records' values. */
  keyHeaders: string[];
  valueHeader: string;
  records: RecordKeys[];
  /** Leave a record's current value when its row's cell is empty (otherwise clear it). */
  skipBlanks: boolean;
}): ColumnPlan {
  const { rows, rowNumbers, keyHeaders, valueHeader, records, skipBlanks } = input;
  const join = (parts: string[]) => parts.join('\u0001');

  const recordsByKey = new Map<string, string[]>();
  for (const record of records) {
    const key = join(record.values.map(normalizeKey));
    recordsByKey.set(key, [...(recordsByKey.get(key) ?? []), record.id]);
  }

  const plan: ColumnPlan = {
    updates: [],
    unmatched: [],
    ambiguous: [],
    conflicting: [],
    blankKey: [],
    skippedBlank: 0,
    recordsUntouched: 0,
  };
  // Every row that reached each record, with its value.
  const byRecord = new Map<string, { row: number; value: string | null }[]>();

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i] ?? i + 2;
    const parts = keyHeaders.map((h) => normalizeKey(row[h]));
    if (parts.every((p) => p === '')) {
      plan.blankKey.push(rowNumber);
      return;
    }
    const ids = recordsByKey.get(join(parts)) ?? [];
    if (ids.length === 0) {
      plan.unmatched.push(rowNumber);
      return;
    }
    if (ids.length > 1) {
      plan.ambiguous.push(rowNumber);
      return;
    }
    const text = String(row[valueHeader] ?? '').trim();
    byRecord.set(ids[0], [...(byRecord.get(ids[0]) ?? []), { row: rowNumber, value: text === '' ? null : text }]);
  });

  for (const [id, hits] of byRecord) {
    const distinct = new Set(hits.map((h) => h.value));
    if (distinct.size > 1) {
      plan.conflicting.push(...hits.map((h) => h.row));
      continue;
    }
    const value = hits[0].value;
    if (value === null && skipBlanks) {
      plan.skippedBlank += hits.length;
      continue;
    }
    plan.updates.push({ id, value });
  }
  plan.conflicting.sort((a, b) => a - b);
  plan.recordsUntouched = records.length - byRecord.size;
  return plan;
}
