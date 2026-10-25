import { isBlank } from './values';

/** The first sheet of a spreadsheet, as the import wizard works with it. */
export interface ParsedSpreadsheet {
  headers: string[];
  /** Every row that holds a value, keyed by header. */
  rows: Record<string, unknown>[];
  /** Spreadsheet row of each entry in `rows` (1-based, header row = 1). */
  rowNumbers: number[];
}

/**
 * Reads the first sheet with its header row. Runs in the browser (see
 * parse-spreadsheet.worker.ts): the parsed rows used to come back from the
 * server in one response, which broke past Vercel's 4.5 MB limit. SheetJS is
 * passed in so this file never pulls the library into a bundle by itself.
 */
export function parseSpreadsheet(XLSX: typeof import('xlsx'), data: ArrayBuffer): ParsedSpreadsheet {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('This file has no sheets');
  const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });

  // Keep each row's real spreadsheet row number so problems can be reported
  // as rows the admin can find in Excel. SheetJS skips empty rows, so the
  // array index drifts; it records the true 0-based sheet row as a
  // non-enumerable __rowNum__. Rows holding only whitespace aren't records.
  const rows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];
  parsed.forEach((row, i) => {
    if (Object.values(row).every(isBlank)) return;
    rows.push(row);
    const sheetRow = (row as { __rowNum__?: number }).__rowNum__;
    rowNumbers.push(typeof sheetRow === 'number' ? sheetRow + 1 : i + 2);
  });

  return { headers: rows.length > 0 ? Object.keys(rows[0]) : [], rows, rowNumbers };
}
