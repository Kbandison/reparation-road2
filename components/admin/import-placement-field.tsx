'use client';

import { AlertCircle, Info, Layers, Table2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OwnPlacement, Placement, SharedPlacement } from '@/lib/import/placeholders';

interface ImportPlacementFieldProps {
  collectionName: string;
  /** Top-level collections usually get tabs, which changes the advice shown. */
  isTopLevel: boolean;
  suggestions: { shared: SharedPlacement | null; own: OwnPlacement };
  placement: Placement;
  onChange: (placement: Placement) => void;
  problems: string[];
}

/**
 * Collection step for a placeholder ("Coming Soon") collection: where its
 * records will live. Either alongside its sibling tabs in their shared table,
 * tagged so only this tab shows them, or in a table of its own.
 */
export function ImportPlacementField({
  collectionName,
  isTopLevel,
  suggestions,
  placement,
  onChange,
  problems,
}: ImportPlacementFieldProps) {
  const options = [
    suggestions.shared && {
      value: suggestions.shared,
      icon: Layers,
      title: 'Share with its sibling tabs',
      detail: `Goes into ${suggestions.shared.table}, tagged so only this tab shows them.`,
    },
    {
      value: suggestions.own,
      icon: Table2,
      title: 'Its own table',
      detail: suggestions.shared
        ? 'A separate table, for records shaped differently from the other tabs.'
        : 'A new table just for this collection’s records.',
    },
  ].filter((o): o is NonNullable<typeof o> => Boolean(o));

  return (
    <div className="rounded-2xl border border-brand-gold/[0.12] bg-brand-card p-4 sm:p-5 space-y-4">
      <div>
        <p className="text-sm font-medium text-brand-cream">“{collectionName}” has no records yet</p>
        <p className="text-xs text-brand-muted mt-0.5">
          Choose where its records will live. It keeps its name, description and place on the site, and shows the
          records as soon as the import finishes.
        </p>
      </div>

      {isTopLevel && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-gold/25 bg-brand-gold/[0.06] px-3 py-2.5">
          <Info className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-brand-cream">
            Planning tabs for this collection? Create each tab with <span className="font-medium">Create New Collection</span>{' '}
            and pick “{collectionName}” as its parent, then import into the tab. Importing here makes it a single list,
            and tabs added later won’t show.
          </p>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="sr-only">Where the records go</legend>
        <div className={`grid gap-2 ${options.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {options.map((option) => {
            const checked = placement.kind === option.value.kind;
            const Icon = option.icon;
            return (
              <label
                key={option.value.kind}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  checked
                    ? 'border-brand-gold bg-brand-gold/[0.08]'
                    : 'border-brand-gold/[0.12] hover:border-brand-gold/[0.25]'
                }`}
              >
                <input
                  type="radio"
                  name="placement"
                  checked={checked}
                  onChange={() => onChange(option.value)}
                  className="mt-1 accent-[#C8956C]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm text-brand-cream">
                    <Icon className="w-3.5 h-3.5 text-brand-gold shrink-0" aria-hidden="true" />
                    {option.title}
                  </span>
                  <span className="block text-[11px] text-brand-muted mt-0.5">{option.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {placement.kind === 'shared' ? (
        <div className="space-y-1.5">
          <Label htmlFor="placement-tag" className="text-xs">
            Tag every record with <span className="font-mono text-brand-cream">{placement.column}</span> =
          </Label>
          <Input
            id="placement-tag"
            value={placement.value}
            onChange={(e) => onChange({ ...placement, value: e.target.value })}
            className="bg-brand-bg border-brand-gold/[0.15] font-mono h-9 max-w-xs"
            aria-invalid={problems.length > 0}
          />
          <p className="text-[11px] text-brand-muted">
            The other tabs in <span className="font-mono">{placement.table}</span> use their own value here, which is how
            each tab shows only its records.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="placement-table" className="text-xs">Table name</Label>
          <Input
            id="placement-table"
            value={placement.table}
            onChange={(e) => onChange({ ...placement, table: e.target.value.toLowerCase() })}
            className="bg-brand-bg border-brand-gold/[0.15] font-mono h-9 max-w-xs"
            aria-invalid={problems.length > 0}
          />
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1" role="alert">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-1.5 text-[11px] text-brand-burgundy-light">
              <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
              {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
