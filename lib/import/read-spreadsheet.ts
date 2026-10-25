import type { ParsedSpreadsheet } from './parse-spreadsheet';
import type { ParseResponse } from './parse-spreadsheet.worker';

/**
 * Parses an .xlsx/.xls file in a Web Worker. Browser only. The file's bytes
 * are handed to the worker rather than copied, and the worker is shut down as
 * soon as it answers.
 */
export async function readSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const data = await file.arrayBuffer();

  return new Promise<ParsedSpreadsheet>((resolve, reject) => {
    const worker = new Worker(new URL('./parse-spreadsheet.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      worker.terminate();
      const response = event.data;
      if (response.ok) resolve({ headers: response.headers, rows: response.rows, rowNumbers: response.rowNumbers });
      else reject(new Error(`Couldn't read this file: ${response.error}`));
    };
    // The worker script itself failed to load or crashed, which happens when
    // the site was redeployed after this page was opened.
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error("Couldn't start the spreadsheet reader. Reload the page and try again."));
    };

    worker.postMessage(data, [data]);
  });
}
