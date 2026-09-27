'use client';

import { AlertCircle, Lock } from 'lucide-react';
import { clipValue } from '@/lib/import/format';
import { typeLabel, type ColumnProfile } from '@/lib/import/values';
import type { ImportColumnType } from '@/lib/import/types';

const NEW_COLUMN_TYPES: ImportColumnType[] = ['text', 'integer', 'boolean'];

interface ImportColumnTypeFieldProps {
  /** Target column, or '' when the header is skipped. */
  column: string;
  /** The column's real type when it already exists (built-in columns are always text). */
  fixedType?: string;
  /** Rows whose values the existing column can't take as it is. */
  problemRows?: number;
  /** For a column this import creates: what its values allow, and the chosen type. */
  profile?: ColumnProfile;
  value?: ImportColumnType;
  onChange?: (type: ImportColumnType) => void;
}

/**
 * The "Type" cell on the Mapping step. An existing column shows its type
 * locked. A new column offers only the types every one of its values fits, and
 * says why a number-looking column stayed text.
 */
export function ImportColumnTypeField({
  column,
  fixedType,
  problemRows,
  profile,
  value,
  onChange,
}: ImportColumnTypeFieldProps) {
  if (!column) return <span className="text-xs text-brand-muted">—</span>;

  if (fixedType) {
    return (
      <div className="space-y-1">
        <span
          className="inline-flex items-center gap-1 rounded-lg border border-brand-gold/[0.08] bg-brand-bg px-2 py-1 text-xs text-brand-cream"
          title="This column already exists, so the table sets its type"
        >
          <Lock className="w-3 h-3 text-brand-muted" aria-hidden="true" />
          {typeLabel(fixedType)}
          <span className="sr-only"> (set by the table)</span>
        </span>
        {problemRows ? (
          <p className="flex items-start gap-1 text-[11px] text-brand-gold">
            <AlertCircle className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
            {problemRows.toLocaleString()} row{problemRows === 1 ? '' : 's'} won&apos;t fit. You can
            fix this on the Preview step.
          </p>
        ) : null}
      </div>
    );
  }

  const allowed = profile?.allowed ?? ['text'];
  const notWhole = profile?.notWhole;

  return (
    <div className="space-y-1">
      <select
        value={value ?? 'text'}
        onChange={(e) => onChange?.(e.target.value as ImportColumnType)}
        aria-label={`Type for the new column ${column}`}
        className="w-full px-2 py-1.5 bg-brand-bg border border-brand-gold/[0.08] rounded-lg text-xs text-brand-cream"
      >
        {NEW_COLUMN_TYPES.map((type) => (
          <option key={type} value={type} disabled={!allowed.includes(type)}>
            {typeLabel(type)}
          </option>
        ))}
      </select>
      {notWhole && value === 'text' && (
        <p className="text-[11px] leading-snug text-brand-muted">
          Text, because {notWhole.count.toLocaleString()} value{notWhole.count === 1 ? " isn't a" : "s aren't"}{' '}
          whole number{notWhole.count === 1 ? '' : 's'}, e.g.{' '}
          {notWhole.examples.map((e, i) => (
            <span key={e.row}>
              {i > 0 && ', '}
              <span className="text-brand-cream">“{clipValue(e.value)}”</span> (row {e.row.toLocaleString()})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
