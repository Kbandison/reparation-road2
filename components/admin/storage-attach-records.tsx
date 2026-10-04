'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Link2, Loader2 } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ImportCollection } from '@/lib/collections/queries';
import type { StorageLocation } from '@/lib/hooks/use-storage';
import { ImportWizard } from './import-wizard';

interface StorageAttachRecordsProps {
  collections: ImportCollection[];
  /** Files uploaded this session, as `{ name, path: "bucket/path" }`. */
  uploaded: { name: string; path: string }[];
  /** Where the scans are: the last upload's folder, else the open one. The spreadsheet import matches against it. */
  imageSource: StorageLocation | null;
  imageSourceVersion: number;
  uploadsInProgress: number;
}

type Mode = 'new' | 'link';

/**
 * Connects the files just uploaded to records, two ways:
 * - Add new records from a spreadsheet: the import wizard, starting from the
 *   upload folder, so records and their scans go in together.
 * - Link to existing records: writes each file's path onto records whose
 *   chosen column matches its filename.
 */
export function StorageAttachRecords({
  collections,
  uploaded,
  imageSource,
  imageSourceVersion,
  uploadsInProgress,
}: StorageAttachRecordsProps) {
  const [mode, setMode] = useState<Mode>('new');

  return (
    <section aria-labelledby="attach-heading" className="rounded-2xl border border-brand-gold/[0.08] bg-brand-card">
      <div className="border-b border-brand-gold/[0.08] px-4 py-3">
        <h2 id="attach-heading" className="font-display text-base font-semibold text-brand-cream">Attach to records</h2>
        <p className="mt-0.5 text-xs text-brand-muted">Optional. Connect what you uploaded to collection records.</p>
      </div>

      <div className="space-y-5 p-4">
        <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-5">
          <Tabs.List aria-label="How to attach" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              { value: 'new', icon: FileSpreadsheet, title: 'Add new records from a spreadsheet', detail: 'Import rows and link each to its scan in one go.' },
              { value: 'link', icon: Link2, title: 'Link to existing records', detail: 'Match uploaded filenames to records already in a collection.' },
            ] as const).map((option) => {
              const Icon = option.icon;
              return (
                <Tabs.Trigger
                  key={option.value}
                  value={option.value}
                  className="flex items-start gap-3 rounded-xl border border-brand-gold/[0.12] px-3 py-3 text-left transition-colors hover:border-brand-gold/[0.25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50 data-[state=active]:border-brand-gold data-[state=active]:bg-brand-gold/[0.08]"
                >
                  <Icon className="mt-0.5 w-4 h-4 shrink-0 text-brand-gold" aria-hidden="true" />
                  <span>
                    <span className="block text-sm text-brand-cream">{option.title}</span>
                    <span className="block text-[11px] text-brand-muted">{option.detail}</span>
                  </span>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          {/* forceMount keeps a half-finished import alive while the other tab is open. */}
          <Tabs.Content value="new" forceMount className="outline-none data-[state=inactive]:hidden">
            {imageSource ? (
              <ImportWizard
                collections={collections}
                imageSource={imageSource}
                imageSourceVersion={imageSourceVersion}
                uploadsInProgress={uploadsInProgress}
              />
            ) : (
              <p className="text-sm text-brand-muted">
                Open the folder that holds the scans above, or upload them, and the spreadsheet import will match its rows
                to that folder.
              </p>
            )}
          </Tabs.Content>

          <Tabs.Content value="link" className="outline-none">
            <LinkExistingRecords collections={collections} uploaded={uploaded} />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </section>
  );
}

/** Writes uploaded files' paths onto records whose chosen column matches the filename. */
function LinkExistingRecords({ collections, uploaded }: { collections: ImportCollection[]; uploaded: { name: string; path: string }[] }) {
  const [table, setTable] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [matchColumn, setMatchColumn] = useState('');
  const [loadingCols, setLoadingCols] = useState(false);
  const [attaching, setAttaching] = useState(false);

  // Matching runs over a whole table, so tabs sharing one table appear once,
  // named after the collection they're tabs of.
  const tables = useMemo(() => {
    const bySlug = new Map(collections.map((c) => [c.slug, c]));
    const groups = new Map<string, ImportCollection[]>();
    for (const c of collections) {
      if (c.table_name) groups.set(c.table_name, [...(groups.get(c.table_name) ?? []), c]);
    }
    return [...groups].map(([tableName, group]) => {
      const parent = group[0].parent_slug ? bySlug.get(group[0].parent_slug) : undefined;
      const label = group.length === 1 ? group[0].name : `${parent?.name ?? group[0].name} — all ${group.length} tabs`;
      return { tableName, label };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [collections]);

  // Load the table's columns so the admin can pick which one to match filenames against.
  const chooseTable = async (next: string) => {
    setTable(next);
    setColumns([]);
    setMatchColumn('');
    if (!next) return;
    setLoadingCols(true);
    try {
      const res = await fetch(`/api/admin/import?action=schema&table=${encodeURIComponent(next)}`);
      const data = await res.json();
      // image_path is always present on imported tables; make sure it's offered.
      const all = Array.from(new Set(['image_path', ...((data.columns as string[]) ?? [])]));
      setColumns(all);
      setMatchColumn('image_path');
    } catch {
      toast.error('Could not load table columns');
    } finally {
      setLoadingCols(false);
    }
  };

  const attach = async () => {
    if (!table) return toast.error('Choose a collection first');
    if (uploaded.length === 0) return toast.error('Upload some files first');
    setAttaching(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach-images', tableName: table, matchColumn: matchColumn || 'image_path', files: uploaded }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'Attach failed');
      if (data.updated > 0) {
        toast.success(`Linked ${data.updated} record${data.updated === 1 ? '' : 's'} to ${data.matchedFiles} file${data.matchedFiles === 1 ? '' : 's'}`);
      } else {
        toast.warning('No records matched. Check the match column.');
      }
      if (data.unmatched?.length) {
        const n = data.unmatched.length;
        toast.info(`${n} file${n === 1 ? '' : 's'} matched no record`);
      }
    } catch {
      toast.error('Attach failed');
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-brand-muted">
        Writes each uploaded file’s storage path onto the <span className="font-mono">image_path</span> of records whose
        chosen column matches its filename.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="attach-collection">Collection</Label>
          <select
            id="attach-collection"
            value={table}
            onChange={(e) => chooseTable(e.target.value)}
            className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
          >
            <option value="">— Select a collection —</option>
            {tables.map((t) => (
              <option key={t.tableName} value={t.tableName}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="attach-column" className="flex items-center gap-2">
            Match filenames against
            {loadingCols && <Loader2 className="w-3 h-3 animate-spin text-brand-muted" aria-hidden="true" />}
          </Label>
          <select
            id="attach-column"
            value={matchColumn}
            onChange={(e) => setMatchColumn(e.target.value)}
            disabled={!table || loadingCols}
            className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none disabled:opacity-50"
          >
            {columns.length === 0 && <option value="">—</option>}
            {columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={attach}
          disabled={attaching || !table || uploaded.length === 0}
          variant="outline"
          className="rounded-xl border-brand-gold/[0.25] text-brand-cream hover:bg-brand-gold/[0.08]"
        >
          {attaching ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> Linking…</>
          ) : (
            <><Link2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Link {uploaded.length || ''} uploaded file{uploaded.length === 1 ? '' : 's'}</>
          )}
        </Button>
        <p className="text-[11px] text-brand-muted">
          Tip: pick <span className="font-mono">image_path</span> to repair records whose image filename is stored but broken.
        </p>
      </div>
    </div>
  );
}
