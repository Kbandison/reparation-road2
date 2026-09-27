import { formatRowList } from '@/lib/import/format';
import type { ImportFailure } from '@/lib/import/types';

/**
 * Rows the database still refused during an import, grouped by the reason it
 * gave, with spreadsheet row numbers so they can be found and fixed in Excel.
 */
export function ImportFailureList({ failures }: { failures: ImportFailure[] }) {
  return (
    <div className="bg-brand-bg border border-red-500/20 rounded-xl p-4 text-left max-h-64 overflow-y-auto space-y-3">
      {failures.map((failure) => (
        <div key={failure.message}>
          <p className="text-xs text-red-400 break-words">{failure.message}</p>
          <p className="text-[11px] text-brand-muted mt-0.5">
            {failure.rows.length.toLocaleString()} row{failure.rows.length === 1 ? '' : 's'}:{' '}
            {formatRowList(failure.rows)}
          </p>
        </div>
      ))}
    </div>
  );
}
