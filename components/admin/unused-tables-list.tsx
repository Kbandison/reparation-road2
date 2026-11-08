'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropTableDialog } from '@/components/admin/drop-table-dialog';
import type { UnusedTable } from '@/lib/collections/unused-tables';

const KIND_LABEL: Record<UnusedTable['kind'], { label: string; className: string }> = {
  leftover: { label: 'Left over', className: 'bg-brand-gold/10 text-brand-gold' },
  legacy: { label: 'Legacy copy', className: 'bg-brand-muted/10 text-brand-muted' },
  backup: { label: 'Backup', className: 'bg-brand-muted/10 text-brand-muted' },
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;

type Peek = { rows: Record<string, string>[] } | { error: string } | 'loading';

/** Admin → Collections → Unused tables: records tables no collection uses, to check and remove. */
export function UnusedTablesList() {
  const [tables, setTables] = useState<UnusedTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, Peek>>({});
  const [removing, setRemoving] = useState<UnusedTable | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/tables')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Could not load the tables (${r.status})`);
        return data.tables as UnusedTable[];
      })
      .then((list) => {
        if (!active) return;
        // Most recent first: a table left behind today is the likeliest one to matter.
        setTables([...list].sort((a, b) => (b.newestRow ?? '').localeCompare(a.newestRow ?? '')));
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Could not load the tables'));
    return () => {
      active = false;
    };
  }, []);

  const closePeek = (name: string) =>
    setOpen((o) => {
      const next = { ...o };
      delete next[name];
      return next;
    });

  const togglePeek = async (name: string) => {
    if (open[name]) {
      closePeek(name);
      return;
    }
    setOpen((o) => ({ ...o, [name]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/tables?peek=${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not read the table');
      setOpen((o) => ({ ...o, [name]: { rows: data.rows } }));
    } catch (err) {
      setOpen((o) => ({ ...o, [name]: { error: err instanceof Error ? err.message : 'Could not read the table' } }));
    }
  };

  if (error) {
    return (
      <p className="text-sm text-brand-burgundy-light bg-brand-burgundy/10 border border-brand-burgundy/20 rounded-xl px-4 py-3" role="alert">
        {error}
      </p>
    );
  }

  if (!tables) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-brand-card border border-brand-gold/[0.08] animate-pulse" />
        ))}
        <p className="flex items-center gap-1.5 text-xs text-brand-muted">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking every table…
        </p>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-gold/[0.08] bg-brand-card p-10 text-center">
        <Database className="w-8 h-8 text-brand-sage mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-brand-cream">No unused tables</p>
        <p className="text-xs text-brand-muted mt-1">Every records table belongs to a collection.</p>
      </div>
    );
  }

  const totalRows = tables.reduce((n, t) => n + (t.rows ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-muted">
        {tables.length.toLocaleString()} table{tables.length === 1 ? '' : 's'} holding {totalRows.toLocaleString()} records
        that no collection shows. Peek inside before removing one: removal deletes its records for good.
      </p>

      <ul className="space-y-3">
        {tables.map((table) => {
          const peek = open[table.name];
          const kind = KIND_LABEL[table.kind];
          return (
            <li key={table.name} className="rounded-2xl border border-brand-gold/[0.08] bg-brand-card">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-brand-cream break-all">{table.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${kind.className}`}>{kind.label}</span>
                  </div>
                  <p className="text-xs text-brand-muted mt-1">
                    {table.rows === null ? 'Rows unknown' : `${table.rows.toLocaleString()} record${table.rows === 1 ? '' : 's'}`}
                    {formatDate(table.newestRow) && ` · newest added ${formatDate(table.newestRow)}`}
                    {table.links > 0 && ` · ${table.links.toLocaleString()} related-record or citation links go with it`}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => togglePeek(table.name)}
                    aria-expanded={!!peek}
                    className="border-brand-gold/20 text-brand-cream rounded-xl text-xs h-8"
                  >
                    {peek ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
                    Peek
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRemoving(table)}
                    className="border-brand-burgundy/30 text-brand-burgundy-light hover:bg-brand-burgundy/10 rounded-xl text-xs h-8"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
              </div>

              {peek && (
                <div className="border-t border-brand-gold/[0.06] px-4 pb-4 pt-3">
                  {peek === 'loading' ? (
                    <p className="flex items-center gap-1.5 text-xs text-brand-muted">
                      <Loader2 className="w-3 h-3 animate-spin" /> Reading…
                    </p>
                  ) : 'error' in peek ? (
                    <p className="text-xs text-brand-burgundy-light">{peek.error}</p>
                  ) : peek.rows.length === 0 ? (
                    <p className="text-xs text-brand-muted">The table is empty.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-brand-muted">
                            {Object.keys(peek.rows[0]).map((col) => (
                              <th key={col} className="px-2 py-1 font-medium whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {peek.rows.map((row, i) => (
                            <tr key={i} className="border-t border-brand-gold/[0.04] text-brand-cream/80">
                              {Object.keys(peek.rows[0]).map((col) => (
                                <td key={col} className="px-2 py-1 whitespace-nowrap max-w-[220px] truncate" title={row[col]}>
                                  {row[col] || <span className="text-brand-muted">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <DropTableDialog
        table={removing?.name ?? null}
        rows={removing?.rows ?? null}
        onClose={() => setRemoving(null)}
        onDropped={(name) => {
          setRemoving(null);
          setTables((list) => list?.filter((t) => t.name !== name) ?? null);
          closePeek(name);
          toast.success(`Removed ${name}`);
        }}
      />
    </div>
  );
}
