'use client';

import { useState, useEffect } from 'react';
import { Loader2, ChevronUp, ChevronDown, Plus, X, Eye, Search } from 'lucide-react';

interface ColumnManagerProps {
  tableName: string;
  displayColumns: string[];
  searchColumns: string[];
  onChange: (next: { displayColumns: string[]; searchColumns: string[] }) => void;
}

/**
 * Lets an admin see every column in a collection's table and choose which are
 * shown to users (display columns, ordered) and which are searchable. The full
 * column list is read from the table schema, so columns that exist in the data
 * but were never configured still surface here.
 */
export function ColumnManager({
  tableName,
  displayColumns,
  searchColumns,
  onChange,
}: ColumnManagerProps) {
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/import?action=schema&table=${encodeURIComponent(tableName)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.columns)) setAllColumns(data.columns);
        else setError(data.error || 'Could not load columns');
      } catch {
        if (!cancelled) setError('Could not load columns');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tableName]);

  // Union of schema columns with any already-configured ones, so a stored
  // column that's missing from the sample row still appears.
  const universe = Array.from(new Set([...allColumns, ...displayColumns, ...searchColumns]));
  const available = universe.filter((c) => !displayColumns.includes(c));

  const emit = (display: string[], search: string[]) =>
    onChange({ displayColumns: display, searchColumns: search });

  const addDisplay = (col: string) => emit([...displayColumns, col], searchColumns);
  const removeDisplay = (col: string) =>
    emit(displayColumns.filter((c) => c !== col), searchColumns);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...displayColumns];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    emit(next, searchColumns);
  };

  const toggleSearch = (col: string) => {
    const next = searchColumns.includes(col)
      ? searchColumns.filter((c) => c !== col)
      : [...searchColumns, col];
    emit(displayColumns, next);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-muted py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading columns…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-brand-burgundy-light py-2">{error}</p>;
  }

  return (
    <div className="space-y-5">
      {/* Display columns — ordered, shown to users */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-brand-gold" />
          <span className="text-sm font-medium text-brand-cream">Shown columns</span>
          <span className="text-[11px] text-brand-muted">· in display order</span>
        </div>

        {displayColumns.length === 0 ? (
          <p className="text-[11px] text-brand-muted">
            No columns selected — records will show with default formatting. Add columns below.
          </p>
        ) : (
          <div className="space-y-1">
            {displayColumns.map((col, idx) => (
              <div
                key={col}
                className="flex items-center gap-2 bg-brand-card border border-brand-gold/[0.12] rounded-lg px-2.5 py-1.5"
              >
                <span className="text-[11px] text-brand-muted w-4 text-center">{idx + 1}</span>
                <span className="text-sm text-brand-cream font-mono flex-1 truncate">{col}</span>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-brand-muted hover:text-brand-gold disabled:opacity-30"
                  aria-label={`Move ${col} up`}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === displayColumns.length - 1}
                  className="p-0.5 text-brand-muted hover:text-brand-gold disabled:opacity-30"
                  aria-label={`Move ${col} down`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeDisplay(col)}
                  className="p-0.5 text-brand-muted hover:text-brand-burgundy-light"
                  aria-label={`Remove ${col}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available columns — click to add to display */}
      {available.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] text-brand-muted uppercase tracking-wide">
            Available columns
          </span>
          <div className="flex flex-wrap gap-1.5">
            {available.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => addDisplay(col)}
                className="inline-flex items-center gap-1 bg-brand-card border border-brand-gold/[0.12] rounded-lg px-2 py-1 text-xs text-brand-cream font-mono hover:border-brand-gold/35 transition-colors"
              >
                <Plus className="w-3 h-3 text-brand-gold" /> {col}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search columns — which fields keyword search looks in */}
      <div className="space-y-2 border-t border-brand-gold/[0.06] pt-4">
        <div className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-brand-gold" />
          <span className="text-sm font-medium text-brand-cream">Searchable columns</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {universe.map((col) => {
            const on = searchColumns.includes(col);
            return (
              <button
                key={col}
                type="button"
                onClick={() => toggleSearch(col)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono border transition-colors ${
                  on
                    ? 'bg-brand-gold/15 border-brand-gold/40 text-brand-gold'
                    : 'bg-brand-card border-brand-gold/[0.12] text-brand-muted hover:text-brand-cream'
                }`}
              >
                {col}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-brand-muted">
          Keyword search matches against these columns. Leave empty to fall back to the shown columns.
        </p>
      </div>
    </div>
  );
}
