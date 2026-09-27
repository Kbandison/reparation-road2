import { isBlank } from './values';
import type { ImportFailure } from './types';

/**
 * The "rows to fix" download: every row the database refused, with its reason
 * and original row number up front, then the file's own columns untouched, so
 * the admin can correct them in Excel and import that file back.
 */

/** Helper columns the download adds; the wizard skips them when the file comes back. */
export const FAILED_ROWS_REASON = 'Why it failed';
export const FAILED_ROWS_ORIGINAL_ROW = 'Original row';

const HELPER_HEADERS = new Set([FAILED_ROWS_REASON, FAILED_ROWS_ORIGINAL_ROW].map((h) => h.toLowerCase()));

export function isFailedRowsHelperHeader(header: string): boolean {
  return HELPER_HEADERS.has(header.trim().toLowerCase());
}

/**
 * Sheet rows for the download, in original-file order. A file that is itself
 * a fixed download keeps pointing "Original row" at the master spreadsheet
 * rather than at the intermediate file.
 */
export function buildFailedRowsSheet(
  allRows: Record<string, unknown>[],
  rowNumbers: number[],
  headers: string[],
  failures: ImportFailure[],
): { header: string[]; rows: Record<string, unknown>[] } {
  const fileHeaders = headers.filter((h) => !isFailedRowsHelperHeader(h));
  const priorOriginalRow = headers.find((h) => h.trim().toLowerCase() === FAILED_ROWS_ORIGINAL_ROW.toLowerCase());

  const indexByRow = new Map<number, number>();
  allRows.forEach((_, i) => indexByRow.set(rowNumbers[i] ?? i + 2, i));

  const reasonByRow = new Map<number, string>();
  for (const failure of failures) for (const row of failure.rows) reasonByRow.set(row, failure.message);

  const rows: Record<string, unknown>[] = [];
  for (const row of [...reasonByRow.keys()].sort((a, b) => a - b)) {
    const index = indexByRow.get(row);
    if (index === undefined) continue;
    const source = allRows[index];
    const carried = priorOriginalRow ? source[priorOriginalRow] : undefined;
    const out: Record<string, unknown> = {
      [FAILED_ROWS_REASON]: reasonByRow.get(row),
      [FAILED_ROWS_ORIGINAL_ROW]: isBlank(carried) ? row : carried,
    };
    for (const header of fileHeaders) out[header] = source[header] ?? '';
    rows.push(out);
  }

  return { header: [FAILED_ROWS_REASON, FAILED_ROWS_ORIGINAL_ROW, ...fileHeaders], rows };
}

/** "Register.xlsx" → "Register - rows to fix.xlsx", without stacking the suffix on later rounds. */
export function failedRowsFileName(uploadedName: string): string {
  const base = uploadedName.replace(/\.[^.]+$/, '').replace(/ - rows to fix$/i, '') || 'import';
  return `${base} - rows to fix.xlsx`;
}
