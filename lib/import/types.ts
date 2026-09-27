/**
 * Shapes shared by the admin spreadsheet import: the wizard in
 * components/admin/import-wizard.tsx and the /api/admin/import route.
 */

/** Column types the wizard can create for a brand-new column. */
export type ImportColumnType = 'text' | 'integer' | 'boolean';

/** What the import checks a file against for a table that already exists. */
export interface TableColumns {
  /** Postgres type of each column as PostgREST reports it, e.g. "integer", "text". */
  columnTypes: Record<string, string>;
  /** NOT NULL columns with no default, so every row has to supply a value. */
  requiredColumns: string[];
}

/** A spreadsheet value and the row it sits on (1-based, header row = 1). */
export interface RowValue {
  row: number;
  value: string;
}

/** A spreadsheet row after column mapping, tagged with its row number in the file. */
export interface PreparedRow {
  row: number;
  record: Record<string, unknown>;
}

/**
 * Why the file can't go into the table as it stands. Found before anything is
 * written, so one bad value never sinks a batch.
 * - type: values the column's type can't hold ("7months" in a whole-number column)
 * - blank: empty cells in a column that can't be empty
 * - unmapped: a column that can't be empty, with nothing in the file mapped to it
 */
export interface ImportConflict {
  column: string;
  kind: 'type' | 'blank' | 'unmapped';
  pgType: string;
  /** Every affected spreadsheet row. */
  rows: number[];
  /** A few distinct offending values (type conflicts only). */
  examples: RowValue[];
}

/** Rows the database still rejected during the insert, grouped by its reason. */
export interface ImportFailure {
  message: string;
  rows: number[];
}
