'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2, FileUp, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  onImported: () => void;
}

interface ImportResult {
  added: number;
  relationships: number;
  warnings: string[];
}

export function ImportDialog({ treeId, open, onOpenChange, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setError(null);
    setResult(null);
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
      const res = await fetch(`/api/family-tree/${treeId}/import`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Import failed.');
        return;
      }
      setResult(data as ImportResult);
      onImported();
    } catch {
      setError('Something went wrong reading the file.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-brand-card border-brand-gold/[0.12] text-brand-cream sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand-cream">Import a GEDCOM file</DialogTitle>
          <DialogDescription className="text-brand-muted">
            Upload a <code className="text-brand-gold">.ged</code> file exported from Ancestry,
            FamilySearch, MyHeritage, or any genealogy program. People and relationships are added
            to this tree.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-brand-sage">
              <CheckCircle2 className="w-5 h-5" />
              <p className="text-sm">
                Imported <strong>{result.added}</strong> people and{' '}
                <strong>{result.relationships}</strong> relationships.
              </p>
            </div>
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
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-2xl border border-dashed border-brand-gold/30 bg-brand-bg/40 px-4 py-8 text-center hover:border-brand-gold/50 transition-colors"
            >
              <FileUp className="w-8 h-8 text-brand-gold mx-auto mb-2" />
              <p className="text-sm text-brand-cream">
                {file ? file.name : 'Choose a .ged file'}
              </p>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
