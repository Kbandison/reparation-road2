'use client';

import { useState, useRef, useMemo } from 'react';
import { Upload, Loader2, FileUp, AlertTriangle, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  treeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (homeId?: string) => void;
}

interface ImportedPerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
}

interface ImportResult {
  added: number;
  relationships: number;
  warnings: string[];
  people: ImportedPerson[];
}

const MAX_LISTED = 80;

function personName(p: ImportedPerson): string {
  return [p.given_name, p.surname].filter((s) => s && s.trim()).join(' ').trim() || 'Unnamed';
}

export function ImportDialog({ treeId, open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [query, setQuery] = useState('');
  const [savingHome, setSavingHome] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setError(null);
    setResult(null);
    setQuery('');
    setSavingHome(false);
    setUploading(false);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/family-tree/${treeId}/import`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed.');
        return;
      }
      setResult(data as ImportResult);
    } catch {
      setError('Something went wrong reading the file.');
    } finally {
      setUploading(false);
    }
  }

  async function chooseHome(id?: string) {
    setSavingHome(true);
    try {
      if (id) {
        await fetch(`/api/family-tree/${treeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ home_person_id: id }),
        }).catch(() => {});
      }
      onImported(id);
      reset();
      onOpenChange(false);
    } finally {
      setSavingHome(false);
    }
  }

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? result.people.filter((p) => personName(p).toLowerCase().includes(q))
      : result.people;
    return list.slice(0, MAX_LISTED);
  }, [result, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-brand-card border-brand-gold/[0.12] text-brand-cream sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-brand-cream">Who is the home person?</DialogTitle>
              <DialogDescription className="text-brand-muted">
                Imported <strong className="text-brand-cream">{result.added}</strong> people and{' '}
                <strong className="text-brand-cream">{result.relationships}</strong> relationships. Choose the
                person the pedigree should center on — usually you or the most recent descendant.
              </DialogDescription>
            </DialogHeader>

            {result.warnings.length > 0 && (
              <div className="rounded-xl border border-brand-gold/20 bg-brand-bg/40 p-3 space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-brand-muted flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-brand-gold mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg/60 pl-9 pr-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none"
              />
            </div>

            <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-brand-muted text-center py-4">No people match “{query}”.</p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => chooseHome(p.id)}
                    disabled={savingHome}
                    className="flex items-center justify-between w-full text-left px-3 py-2 rounded-xl border border-transparent hover:border-brand-gold/25 hover:bg-brand-bg/50 transition-colors disabled:opacity-50"
                  >
                    <span className="text-sm text-brand-cream truncate">{personName(p)}</span>
                    {p.birth_date && (
                      <span className="text-xs text-brand-muted shrink-0 ml-2">{p.birth_date}</span>
                    )}
                  </button>
                ))
              )}
              {result.people.length > MAX_LISTED && !query && (
                <p className="text-[11px] text-brand-muted text-center pt-1">
                  Showing first {MAX_LISTED} of {result.people.length} — search to narrow.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => chooseHome(undefined)}
                disabled={savingHome}
                className="text-xs text-brand-muted hover:text-brand-cream"
              >
                Skip for now
              </button>
              {savingHome && <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-brand-cream">Import a GEDCOM file</DialogTitle>
              <DialogDescription className="text-brand-muted">
                Upload a <code className="text-brand-gold">.ged</code> file exported from Ancestry,
                FamilySearch, MyHeritage, or any genealogy program. People and relationships are added to
                this tree.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-2xl border border-dashed border-brand-gold/30 bg-brand-bg/40 px-4 py-8 text-center hover:border-brand-gold/50 transition-colors"
              >
                <FileUp className="w-8 h-8 text-brand-gold mx-auto mb-2" />
                <p className="text-sm text-brand-cream">{file ? file.name : 'Choose a .ged file'}</p>
                <p className="text-xs text-brand-muted mt-1">Up to 8MB</p>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".ged,.gedcom,text/plain"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />

              {error && (
                <p className="text-xs text-brand-burgundy-light flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Import
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
