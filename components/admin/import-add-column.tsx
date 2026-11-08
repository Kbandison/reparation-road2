'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Columns3, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImportCollection } from '@/lib/collections/queries';
import { readSpreadsheet } from '@/lib/import/read-spreadsheet';
import { isFailedRowsHelperHeader } from '@/lib/import/failed-rows';
import {
  RESERVED_COLUMNS,
  cleanColumnName,
  planColumnUpdates,
  type ColumnPlan,
  type RecordKeys,
} from '@/lib/import/add-column';
import { safeExternalUrl } from '@/lib/collections/blur';

interface ImportAddColumnProps {
  collections: ImportCollection[];
  onBack: () => void;
}

interface Sheet {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowNumbers: number[];
}

const SELECT =
  'w-full rounded-xl border border-brand-gold/[0.15] bg-brand-card px-3 py-2 text-sm text-brand-cream focus:border-brand-gold/40 focus:outline-none';
const CHUNK = 2000;

/** "Rows 4, 9, 12 and 30 more" */
function rowList(rows: number[]): string {
  const shown = rows.slice(0, 8).join(', ');
  return rows.length > 8 ? `${shown} and ${rows.length - 8} more` : shown;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Admin → Import → "Add a column to existing records": fill a column (new or
 * existing) on records already in a collection, matching spreadsheet rows to
 * records by one to three columns. Nothing is written until the matches have
 * been checked and confirmed.
 */
export function ImportAddColumn({ collections, onBack }: ImportAddColumnProps) {
  const router = useRouter();
  const targets = useMemo(
    () => collections.filter((c) => c.table_name).sort((a, b) => a.name.localeCompare(b.name)),
    [collections],
  );

  const [slug, setSlug] = useState('');
  const collection = targets.find((c) => c.slug === slug) ?? null;
  const [tableColumns, setTableColumns] = useState<{ name: string; type: string }[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [reading, setReading] = useState(false);

  const [pairs, setPairs] = useState<{ header: string; column: string }[]>([{ header: '', column: '' }]);
  const [valueHeader, setValueHeader] = useState('');
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState('');
  const [existingColumn, setExistingColumn] = useState('');
  const [skipBlanks, setSkipBlanks] = useState(true);
  const [useAsLink, setUseAsLink] = useState(false);

  const [checking, setChecking] = useState(false);
  const [plan, setPlan] = useState<ColumnPlan | null>(null);
  const [writing, setWriting] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState<{ written: number; column: string; linked: boolean } | null>(null);

  // The collection's columns, for matching and for picking an existing column.
  useEffect(() => {
    if (!collection?.table_name) return;
    let active = true;
    fetch(`/api/admin/import?action=schema&table=${encodeURIComponent(collection.table_name)}`)
      .then((r) => json<{ columns: string[]; columnTypes: Record<string, string> }>(r))
      .then((d) => {
        if (active) setTableColumns(d.columns.map((name) => ({ name, type: d.columnTypes[name] })));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not read the collection’s columns'));
    return () => {
      active = false;
    };
  }, [collection?.table_name]);

  const headers = (sheet?.headers ?? []).filter((h) => !isFailedRowsHelperHeader(h));
  const matchable = tableColumns.filter((c) => !RESERVED_COLUMNS.has(c.name) || c.name === 'slug');
  const textColumns = tableColumns.filter(
    (c) => !RESERVED_COLUMNS.has(c.name) && (c.type === 'text' || c.type === 'character varying'),
  );
  const cleanNew = cleanColumnName(newName);
  const newNameTaken = !!cleanNew && tableColumns.some((c) => c.name === cleanNew);
  const column = target === 'new' ? cleanNew : existingColumn || null;
  const pairsReady = pairs.every((p) => p.header && p.column);
  const ready = !!collection && !!sheet && pairsReady && !!valueHeader && !!column && !(target === 'new' && newNameTaken);

  // Any change to the setup invalidates a checked plan.
  const reset = () => {
    setPlan(null);
    setFinished(null);
  };

  const pickCollection = (next: string) => {
    setSlug(next);
    setTableColumns([]);
    setPairs([{ header: '', column: '' }]);
    setExistingColumn('');
    setUseAsLink(targets.find((c) => c.slug === next)?.blur_images === true);
    reset();
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    reset();
    try {
      const parsed = await readSpreadsheet(file);
      setSheet({ fileName: file.name, ...parsed });
      setPairs([{ header: '', column: '' }]);
      setValueHeader('');
      setNewName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t read the file');
    }
    setReading(false);
  };

  const checkMatches = async () => {
    if (!ready || !collection || !sheet) return;
    setChecking(true);
    reset();
    try {
      const keyColumns = pairs.map((p) => p.column).join(',');
      const records: RecordKeys[] = [];
      for (let offset: number | null = 0; offset !== null; ) {
        const page: { rows: RecordKeys[]; next: number | null } = await fetch(
          `/api/admin/record-columns?collection=${encodeURIComponent(collection.slug)}&columns=${encodeURIComponent(keyColumns)}&offset=${offset}`,
        ).then((r) => json(r));
        records.push(...page.rows);
        offset = page.next;
      }
      setPlan(
        planColumnUpdates({
          rows: sheet.rows,
          rowNumbers: sheet.rowNumbers,
          keyHeaders: pairs.map((p) => p.header),
          valueHeader,
          records,
          skipBlanks,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Matching failed');
    }
    setChecking(false);
  };

  const write = async () => {
    if (!plan || !collection || !column || plan.updates.length === 0) return;
    setWriting({ done: 0, total: plan.updates.length });
    const post = (body: Record<string, unknown>) =>
      fetch('/api/admin/record-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collection.slug, ...body }),
      }).then((r) => json<{ column?: string; written?: number }>(r));

    let written = 0;
    try {
      let finalColumn = column;
      if (target === 'new') finalColumn = (await post({ action: 'add-column', column })).column ?? column;
      for (let i = 0; i < plan.updates.length; i += CHUNK) {
        const chunk = plan.updates.slice(i, i + CHUNK);
        await post({ action: 'apply', column: finalColumn, updates: chunk });
        written += chunk.length;
        setWriting({ done: written, total: plan.updates.length });
      }
      let linked = false;
      if (useAsLink && collection.blur_images) {
        const res = await fetch(`/api/admin/collections/${encodeURIComponent(String(collection.id))}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_link_column: finalColumn }),
        });
        linked = res.ok;
        if (!res.ok) toast.error('The values are in, but setting it as the image link column failed. Set it in Admin → Collections → Edit.');
      }
      setFinished({ written, column: finalColumn, linked });
      toast.success(`Wrote ${written.toLocaleString()} value${written === 1 ? '' : 's'} into ${finalColumn}`);
      router.refresh();
    } catch (err) {
      toast.error(
        `${err instanceof Error ? err.message : 'Writing failed'}${written ? ` (${written.toLocaleString()} values were already written; running it again is safe)` : ''}`,
      );
    }
    setWriting(null);
  };

  const notLinks = plan && useAsLink ? plan.updates.filter((u) => u.value !== null && !safeExternalUrl(u.value)).length : 0;
  const percent = writing && writing.total > 0 ? Math.round((writing.done / writing.total) * 100) : 0;

  if (finished) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 sm:p-10 text-center space-y-3">
        <CheckCircle className="w-10 h-10 text-brand-sage mx-auto" aria-hidden="true" />
        <h3 className="font-display text-lg font-semibold text-brand-cream">
          {finished.written.toLocaleString()} record{finished.written === 1 ? '' : 's'} updated
        </h3>
        <p className="text-sm text-brand-muted">
          {collection?.name}: the values are in the <span className="font-mono text-brand-cream">{finished.column}</span> column.
          {finished.linked && ' Blurred images now link to each record’s own address.'}
        </p>
        <Button onClick={onBack} variant="outline" className="border-brand-gold/20 text-brand-cream rounded-xl">
          Back to import options
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Columns3 className="w-6 h-6 text-brand-gold flex-shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-brand-cream">Add a column to existing records</h2>
            <p className="text-xs text-brand-muted mt-1">
              Fills a column on records already in a collection, such as a link to each record&apos;s original image.
              Rows are matched to records by columns they share. Nothing is written until you&apos;ve checked the matches.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-col-collection">Collection</Label>
            <select id="add-col-collection" value={slug} onChange={(e) => pickCollection(e.target.value)} className={SELECT}>
              <option value="">Choose a collection…</option>
              {targets.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-col-file">Spreadsheet</Label>
            <Input
              id="add-col-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="bg-brand-card border-brand-gold/[0.15] file:text-brand-cream"
            />
            {reading && (
              <p className="flex items-center gap-1.5 text-[11px] text-brand-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Reading…
              </p>
            )}
            {sheet && !reading && (
              <p className="text-[11px] text-brand-muted">
                {sheet.fileName}: {sheet.rows.length.toLocaleString()} rows
              </p>
            )}
          </div>
        </div>

        {collection && sheet && (
          <>
            <div className="space-y-2 border-t border-brand-gold/[0.08] pt-4">
              <Label>Match rows to records by</Label>
              <p className="text-[11px] text-brand-muted">
                Pick columns that together tell records apart, like a name and a date. Case and extra spaces don&apos;t matter.
              </p>
              {pairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    aria-label={`Spreadsheet column ${i + 1}`}
                    value={pair.header}
                    onChange={(e) => {
                      setPairs(pairs.map((p, j) => (j === i ? { ...p, header: e.target.value } : p)));
                      reset();
                    }}
                    className={SELECT}
                  >
                    <option value="">Spreadsheet column…</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="text-xs text-brand-muted" aria-hidden="true">=</span>
                  <select
                    aria-label={`Collection column ${i + 1}`}
                    value={pair.column}
                    onChange={(e) => {
                      setPairs(pairs.map((p, j) => (j === i ? { ...p, column: e.target.value } : p)));
                      reset();
                    }}
                    className={SELECT}
                  >
                    <option value="">Collection column…</option>
                    {matchable.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  {pairs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPairs(pairs.filter((_, j) => j !== i));
                        reset();
                      }}
                      className="p-1.5 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover"
                      aria-label="Remove this match column"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {pairs.length < 3 && (
                <button
                  type="button"
                  onClick={() => setPairs([...pairs, { header: '', column: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-brand-gold hover:text-brand-gold-light"
                >
                  <Plus className="w-3.5 h-3.5" /> Match on another column too
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-brand-gold/[0.08] pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-col-value">Values from</Label>
                <select
                  id="add-col-value"
                  value={valueHeader}
                  onChange={(e) => {
                    setValueHeader(e.target.value);
                    if (!newName) setNewName(cleanColumnName(e.target.value) ?? '');
                    reset();
                  }}
                  className={SELECT}
                >
                  <option value="">Spreadsheet column…</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-brand-muted cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={skipBlanks}
                    onChange={(e) => {
                      setSkipBlanks(e.target.checked);
                      reset();
                    }}
                    className="w-4 h-4 rounded"
                  />
                  Leave a record alone when its cell is empty
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>Into</Label>
                <div className="flex gap-4 text-sm text-brand-cream">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={target === 'new'} onChange={() => { setTarget('new'); reset(); }} /> A new column
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={target === 'existing'} onChange={() => { setTarget('existing'); reset(); }} /> An existing column
                  </label>
                </div>
                {target === 'new' ? (
                  <>
                    <Input
                      aria-label="New column name"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        reset();
                      }}
                      placeholder="e.g. source_link"
                      className="bg-brand-card border-brand-gold/[0.15] font-mono"
                    />
                    <p className={`text-[11px] ${newNameTaken || (newName && !cleanNew) ? 'text-brand-burgundy-light' : 'text-brand-muted'}`}>
                      {newNameTaken
                        ? `${cleanNew} already exists. Choose it as an existing column instead.`
                        : newName && !cleanNew
                          ? 'Start the name with a letter.'
                          : cleanNew
                            ? `Saved as ${cleanNew} (text).`
                            : 'Letters, numbers and underscores.'}
                    </p>
                  </>
                ) : (
                  <select
                    aria-label="Existing column"
                    value={existingColumn}
                    onChange={(e) => {
                      setExistingColumn(e.target.value);
                      reset();
                    }}
                    className={SELECT}
                  >
                    <option value="">Text column…</option>
                    {textColumns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {collection.blur_images && (
              <label className="flex items-start gap-2 text-xs text-brand-muted cursor-pointer border-t border-brand-gold/[0.08] pt-4">
                <input type="checkbox" checked={useAsLink} onChange={(e) => setUseAsLink(e.target.checked)} className="w-4 h-4 rounded mt-0.5" />
                <span>
                  <span className="text-brand-cream">Use these as the links for the blurred images.</span> Each record&apos;s
                  blurred image will open its own address (it wins over the collection&apos;s link).
                </span>
              </label>
            )}
          </>
        )}
      </div>

      {plan && (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 space-y-2 text-sm" aria-live="polite">
          <p className="text-brand-cream font-medium">
            {plan.updates.length.toLocaleString()} record{plan.updates.length === 1 ? '' : 's'} will get a value
          </p>
          <ul className="space-y-1 text-xs text-brand-muted">
            {plan.unmatched.length > 0 && <li>No record matches rows {rowList(plan.unmatched)}.</li>}
            {plan.ambiguous.length > 0 && (
              <li>Rows {rowList(plan.ambiguous)} each match more than one record, so they&apos;re skipped. Matching on another column too would tell them apart.</li>
            )}
            {plan.conflicting.length > 0 && (
              <li>Rows {rowList(plan.conflicting)} reach the same record with different values, so none of them is written.</li>
            )}
            {plan.blankKey.length > 0 && <li>Rows {rowList(plan.blankKey)} have empty match cells and are skipped.</li>}
            {plan.skippedBlank > 0 && <li>{plan.skippedBlank.toLocaleString()} matched rows have an empty value and are left alone.</li>}
            {plan.recordsUntouched > 0 && <li>{plan.recordsUntouched.toLocaleString()} records in the collection aren&apos;t in this file and stay as they are.</li>}
            {notLinks > 0 && (
              <li className="text-brand-gold">
                {notLinks.toLocaleString()} of the values aren&apos;t web addresses, so those images won&apos;t link anywhere.
                Write the full address (https://…) in the spreadsheet, not &ldquo;click here&rdquo; text.
              </li>
            )}
          </ul>
        </div>
      )}

      {writing && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <div className="h-1.5 rounded-full bg-brand-card overflow-hidden">
            <div className="h-full bg-brand-gold transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] text-brand-muted">
            Writing {writing.done.toLocaleString()} of {writing.total.toLocaleString()}…
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack} disabled={!!writing} className="border-brand-gold/20 text-brand-cream rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {!plan ? (
          <Button onClick={checkMatches} disabled={!ready || checking} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            {checking ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Check matches
          </Button>
        ) : (
          <Button
            onClick={write}
            disabled={!!writing || plan.updates.length === 0}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            {writing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Write {plan.updates.length.toLocaleString()} value{plan.updates.length === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </div>
  );
}
