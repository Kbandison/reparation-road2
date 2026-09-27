'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FAILED_ROWS_ORIGINAL_ROW,
  FAILED_ROWS_REASON,
  buildFailedRowsSheet,
  failedRowsFileName,
} from '@/lib/import/failed-rows';
import type { ImportFailure } from '@/lib/import/types';

interface ImportFailedRowsDownloadProps {
  allRows: Record<string, unknown>[];
  rowNumbers: number[];
  headers: string[];
  failures: ImportFailure[];
  /** Name of the uploaded file, used to name the download. */
  fileName: string;
}

/**
 * Downloads the rows the database refused as an .xlsx to fix and import back.
 * The spreadsheet library is loaded on click, so it stays out of the wizard's bundle.
 */
export function ImportFailedRowsDownload({ allRows, rowNumbers, headers, failures, fileName }: ImportFailedRowsDownloadProps) {
  const [busy, setBusy] = useState(false);
  const rowCount = failures.reduce((n, f) => n + f.rows.length, 0);

  const download = async () => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const { header, rows } = buildFailedRowsSheet(allRows, rowNumbers, headers, failures);
      const sheet = XLSX.utils.json_to_sheet(rows, { header });
      // Room to read the reason; the file's own columns keep Excel's default width.
      sheet['!cols'] = header.map((h) =>
        h === FAILED_ROWS_REASON ? { wch: 60 } : h === FAILED_ROWS_ORIGINAL_ROW ? { wch: 12 } : {},
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Rows to fix');
      XLSX.writeFile(book, failedRowsFileName(fileName));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the download');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={download}
      disabled={busy}
      variant="outline"
      className="border-brand-gold/20 text-brand-gold hover:text-brand-gold-light rounded-xl text-xs h-8"
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
      )}
      Download {rowCount === 1 ? 'the row' : `${rowCount.toLocaleString()} rows`} to fix (.xlsx)
    </Button>
  );
}
