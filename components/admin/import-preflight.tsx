'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle, Loader2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { clipValue, formatRowList } from '@/lib/import/format';
import { canConvertToText, typeLabel } from '@/lib/import/values';
import type { ImportConflict } from '@/lib/import/types';

interface ImportPreflightProps {
  tableName: string;
  /** False when the import creates the table, so there's nothing yet to check against. */
  tableExists: boolean;
  rowCount: number;
  conflicts: ImportConflict[];
  /** Problems with where the rows are going (e.g. a slug that's taken), not with the rows. */
  blockers: string[];
  /** Columns that keep this collection's records in document order. */
  orderColumns: string[];
  /** Converts a column to text; rejects with a readable message on failure. */
  onConvert: (column: string) => Promise<void>;
  onBackToMapping: () => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

/**
 * The Preview step's pre-check: every row has already been compared with the
 * target table, so anything that would fail the insert shows up here, with
 * spreadsheet row numbers, before a single row is written.
 */
export function ImportPreflight({
  tableName,
  tableExists,
  rowCount,
  conflicts,
  blockers,
  orderColumns,
  onConvert,
  onBackToMapping,
}: ImportPreflightProps) {
  const [target, setTarget] = useState<ImportConflict | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (conflicts.length === 0 && blockers.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-brand-sage">
        <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {tableExists ? (
          <span>
            Checked all {plural(rowCount, 'row')} against <span className="font-mono">{tableName}</span>. Everything fits.
          </span>
        ) : (
          <span>
            All {plural(rowCount, 'row')} fit the column types <span className="font-mono">{tableName}</span> will be
            created with.
          </span>
        )}
      </p>
    );
  }

  const closeDialog = () => {
    if (converting) return;
    setTarget(null);
    setError(null);
  };

  const runConvert = async () => {
    if (!target) return;
    setConverting(true);
    setError(null);
    try {
      await onConvert(target.column);
      setTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const issueCount = conflicts.length + blockers.length;
  const targetSetsOrder = !!target && orderColumns.includes(target.column);

  return (
    <div className="rounded-2xl border border-brand-burgundy/25 bg-brand-burgundy/[0.06] p-4 space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-brand-burgundy-light mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-brand-cream">
            {issueCount === 1 ? 'One thing to fix' : `${issueCount} things to fix`} before importing
          </p>
          <p className="text-xs text-brand-muted">
            Every row was checked against <span className="font-mono">{tableName}</span>. Nothing has been written yet.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {blockers.map((message) => (
          <li key={message} className="rounded-xl border border-brand-gold/[0.08] bg-brand-bg px-3 py-2.5 text-xs text-brand-cream-muted">
            {message}
          </li>
        ))}

        {conflicts.map((conflict) => {
          const rows = plural(conflict.rows.length, 'row');
          const setsOrder = orderColumns.includes(conflict.column);
          return (
            <li
              key={`${conflict.kind}:${conflict.column}`}
              className="rounded-xl border border-brand-gold/[0.08] bg-brand-bg px-3 py-2.5 space-y-2"
            >
              <p className="text-xs text-brand-cream">
                <span className="font-mono text-brand-gold">{conflict.column}</span>
                <span className="text-brand-muted"> · {typeLabel(conflict.pgType)} column</span>
              </p>

              {conflict.kind === 'type' && (
                <p className="text-xs text-brand-cream-muted">
                  {rows} {conflict.rows.length === 1 ? 'has a value' : 'have values'} a{' '}
                  {typeLabel(conflict.pgType).toLowerCase()} column can&apos;t hold, e.g.{' '}
                  {conflict.examples.map((e, i) => (
                    <span key={e.row}>
                      {i > 0 && ', '}
                      <span className="text-brand-cream">“{clipValue(e.value)}”</span> (row {e.row.toLocaleString()})
                    </span>
                  ))}
                  .
                </p>
              )}
              {conflict.kind === 'blank' && (
                <p className="text-xs text-brand-cream-muted">
                  This column can&apos;t be empty, but {rows} leave{conflict.rows.length === 1 ? 's' : ''} it
                  blank. Fill {conflict.rows.length === 1 ? 'it' : 'them'} in (or remove{' '}
                  {conflict.rows.length === 1 ? 'that row' : 'those rows'}), then upload the file again.
                </p>
              )}
              {conflict.kind === 'unmapped' && (
                <p className="text-xs text-brand-cream-muted">
                  This column can&apos;t be empty, and nothing in your file maps to it. Pick a spreadsheet column
                  for it on the Mapping step.
                </p>
              )}

              {conflict.kind !== 'unmapped' && (
                <p className="text-[11px] text-brand-muted">
                  Spreadsheet rows: {formatRowList(conflict.rows)}
                </p>
              )}

              {conflict.kind === 'type' && setsOrder && (
                <p className="flex items-start gap-1.5 text-[11px] text-brand-gold">
                  <AlertTriangle className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
                  This collection uses {conflict.column} to keep records in document order.
                </p>
              )}

              {conflict.kind === 'type' && canConvertToText(conflict.pgType) && (
                <Button
                  onClick={() => setTarget(conflict)}
                  variant="outline"
                  className="h-8 border-brand-gold/20 text-brand-gold hover:text-brand-gold-light rounded-xl text-xs"
                >
                  <Type className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  Convert {conflict.column} to text
                </Button>
              )}
              {conflict.kind === 'type' && !canConvertToText(conflict.pgType) && (
                <p className="text-[11px] text-brand-muted">Fix these rows in the spreadsheet, then upload it again.</p>
              )}
              {conflict.kind === 'unmapped' && (
                <Button
                  onClick={onBackToMapping}
                  variant="outline"
                  className="h-8 border-brand-gold/20 text-brand-cream rounded-xl text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  Back to Mapping
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!target} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent className="bg-brand-bg border-brand-gold/[0.12] rounded-2xl text-brand-cream">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-brand-cream">
              Convert {target?.column} to text?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-brand-cream-muted">
              <span className="font-mono">{target?.column}</span> in <span className="font-mono">{tableName}</span> is
              a {target ? typeLabel(target.pgType).toLowerCase() : ''} column. As text it takes values like
              {target?.examples[0] ? ` “${clipValue(target.examples[0].value)}”` : ' these'} exactly as written.
              Every value already in the table is kept as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 text-xs">
            <p className="text-brand-muted">
              Text sorts character by character, so when sorted by this column numbers will list as 1, 10, 2.
            </p>
            {targetSetsOrder && (
              <p className="flex items-start gap-2 rounded-xl border border-brand-gold/25 bg-brand-gold/[0.06] px-3 py-2 text-brand-cream">
                <AlertTriangle className="w-4 h-4 text-brand-gold shrink-0" aria-hidden="true" />
                This collection keeps its records in document order using {target?.column}. After converting, that
                order will follow text sorting, so page 10 would come before page 2.
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-brand-burgundy/20 bg-brand-burgundy/10 px-3 py-2 text-brand-burgundy-light" role="alert">
                {error}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={converting} className="border-brand-gold/20 text-brand-cream rounded-xl">
              Cancel
            </AlertDialogCancel>
            {/* A plain button, not AlertDialogAction, so the dialog stays open while it runs and can show an error. */}
            <Button
              onClick={runConvert}
              disabled={converting}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              {converting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> Converting…
                </>
              ) : (
                'Convert to text'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
