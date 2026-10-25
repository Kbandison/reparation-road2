import { Sparkles } from 'lucide-react';

interface ImportDisplayColumnsProps {
  /** Every column this import fills that a visitor would see. */
  columns: string[];
  display: string[];
  search: string[];
  onDisplayChange: (columns: string[]) => void;
  onSearchChange: (columns: string[]) => void;
  /** The current picks started from Claude's suggestion. */
  suggested: boolean;
}

const MAX_DISPLAY = 12;
const MAX_SEARCH = 4;

function ChipGroup({
  label,
  hint,
  columns,
  picked,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  columns: string[];
  picked: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const toggle = (col: string) => {
    if (picked.includes(col)) {
      if (picked.length > 1) onChange(picked.filter((c) => c !== col));
    } else if (picked.length < max) {
      // Keep the file's column order.
      onChange(columns.filter((c) => c === col || picked.includes(c)));
    }
  };
  return (
    <fieldset>
      <legend className="text-xs text-brand-cream font-medium">{label}</legend>
      <p className="text-[11px] text-brand-muted mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {columns.map((col) => {
          const on = picked.includes(col);
          return (
            <button
              key={col}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(col)}
              disabled={!on && picked.length >= max}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors disabled:opacity-40 ${
                on
                  ? 'bg-brand-gold/15 border-brand-gold/40 text-brand-gold'
                  : 'bg-brand-bg border-brand-gold/[0.08] text-brand-muted hover:text-brand-cream'
              }`}
            >
              {col}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Preview step, new collections: which columns the collection's table shows, and which ones search reads. */
export function ImportDisplayColumns({ columns, display, search, onDisplayChange, onSearchChange, suggested }: ImportDisplayColumnsProps) {
  if (columns.length === 0) return null;
  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-brand-cream font-medium">How the collection shows</p>
        {suggested && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold">
            <Sparkles className="w-3 h-3" aria-hidden="true" /> Suggested by Claude
          </span>
        )}
      </div>
      <ChipGroup
        label={`Shown in the table (${display.length} of up to ${MAX_DISPLAY})`}
        hint="The columns visitors see in the collection's list. Every column still shows when a record is opened."
        columns={columns}
        picked={display}
        max={MAX_DISPLAY}
        onChange={onDisplayChange}
      />
      <ChipGroup
        label={`Searched (${search.length} of up to ${MAX_SEARCH})`}
        hint="Search ranks matches in these columns first, so pick what people look up: names and places."
        columns={columns}
        picked={search}
        max={MAX_SEARCH}
        onChange={onSearchChange}
      />
      <p className="text-[11px] text-brand-muted">You can change both later in Admin → Collections → Edit.</p>
    </div>
  );
}
