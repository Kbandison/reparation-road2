import * as XLSX from 'xlsx';
import { parseSpreadsheet, type ParsedSpreadsheet } from './parse-spreadsheet';

// Web Worker: reads a spreadsheet off the main thread so the wizard stays
// responsive while a large file parses. Started by read-spreadsheet.ts.

export type ParseResponse = ({ ok: true } & ParsedSpreadsheet) | { ok: false; error: string };

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  let response: ParseResponse;
  try {
    response = { ok: true, ...parseSpreadsheet(XLSX, event.data) };
  } catch (err) {
    response = { ok: false, error: err instanceof Error ? err.message : 'Unreadable spreadsheet' };
  }
  self.postMessage(response);
};
