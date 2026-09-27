import { displayValue, isBlank, valueFitsColumn } from './values';
import type { ImportConflict, PreparedRow, RowValue, TableColumns } from './types';

/** Columns the database manages itself. Never read from, typed by, or checked against the file. */
export const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'embedding', 'tsv']);

/** Text columns create-table gives every imported table. The file can fill them but never retypes them. */
export const BUILT_IN_COLUMNS = new Set(['slug', 'image_path', 'ocr_text']);

/** The table name create-table derives from a collection slug (same rule as the server). */
export function toTableName(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * One spreadsheet row as the record the table will get. `imageMapping` swaps an
 * image name for its storage path. Several headers can feed one column, and a
 * blank never overwrites a value another header already supplied.
 */
export function mapRow(
  row: Record<string, unknown>,
  columnMapping: Record<string, string>,
  imageMapping?: Record<string, string>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [fileCol, dbCol] of Object.entries(columnMapping)) {
    if (!dbCol) continue;
    let value = row[fileCol];
    if (dbCol === 'image_path' && imageMapping && !isBlank(value)) {
      // The wizard keys matches by the trimmed cell text, which also covers
      // image names Excel stored as numbers.
      value = imageMapping[displayValue(value)] ?? value;
    }
    if (isBlank(value)) {
      if (!(dbCol in record)) record[dbCol] = null;
      continue;
    }
    record[dbCol] = value;
  }
  return record;
}

/**
 * Maps every row and tags it with its spreadsheet row number, so problems are
 * reported as rows the admin can find in Excel. Falls back to index + 2 (the
 * header is row 1) when row numbers aren't supplied.
 */
export function prepareRows(
  rows: Record<string, unknown>[],
  rowNumbers: number[] | undefined,
  columnMapping: Record<string, string>,
  imageMapping?: Record<string, string>,
): PreparedRow[] {
  return rows.map((row, i) => ({
    row: rowNumbers?.[i] ?? i + 2,
    record: mapRow(row, columnMapping, imageMapping),
  }));
}

/**
 * Everything that would make the insert fail against an EXISTING table, found
 * before anything is written. Columns the table doesn't have yet are skipped:
 * they're about to be created with a type chosen from these same values.
 */
export function findConflicts(
  prepared: PreparedRow[],
  mappedColumns: string[],
  table: TableColumns,
): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  const mapped = new Set(mappedColumns);

  for (const column of mapped) {
    const pgType = table.columnTypes[column];
    if (!pgType) continue;
    const rows: number[] = [];
    const examples: RowValue[] = [];
    for (const { row, record } of prepared) {
      const value = record[column];
      if (valueFitsColumn(value, pgType)) continue;
      rows.push(row);
      const shown = displayValue(value);
      if (examples.length < 3 && !examples.some((e) => e.value === shown)) {
        examples.push({ row, value: shown });
      }
    }
    if (rows.length > 0) conflicts.push({ column, kind: 'type', pgType, rows, examples });
  }

  for (const column of table.requiredColumns) {
    const pgType = table.columnTypes[column] ?? 'unknown';
    if (!mapped.has(column)) {
      conflicts.push({ column, kind: 'unmapped', pgType, rows: prepared.map((p) => p.row), examples: [] });
      continue;
    }
    const rows = prepared.filter((p) => isBlank(p.record[column])).map((p) => p.row);
    if (rows.length > 0) conflicts.push({ column, kind: 'blank', pgType, rows, examples: [] });
  }

  return conflicts;
}
