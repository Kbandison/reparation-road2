'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { finalStorageName } from '@/lib/storage/names';
import { StorageNameField } from './storage-name-field';

interface StorageCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'bucket' | 'folder';
  /** Where a new folder goes, e.g. "archives/book-1". */
  location?: string;
  /** Creates it; rejects with a readable message (e.g. the name is taken). */
  onCreate: (name: string) => Promise<void>;
}

/** New bucket / New folder, with the name cleanup previewed as you type. */
export function StorageCreateDialog({ open, onOpenChange, kind, location, onCreate }: StorageCreateDialogProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setValue('');
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!finalStorageName('clean', value) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(value);
      setValue('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not create the ${kind}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-brand-card border-brand-gold/[0.12] text-brand-cream sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-brand-cream">
              {kind === 'bucket' ? 'New bucket' : 'New folder'}
            </DialogTitle>
            <DialogDescription className="text-brand-muted">
              {kind === 'bucket'
                ? 'A public bucket, so record pages can show the files you put in it.'
                : <>Created inside <span className="font-mono text-brand-cream break-all">{location}</span>.</>}
            </DialogDescription>
          </DialogHeader>

          <StorageNameField
            id={`new-${kind}-name`}
            label={kind === 'bucket' ? 'Bucket name' : 'Folder name'}
            value={value}
            onChange={setValue}
            kind="clean"
            placeholder={kind === 'bucket' ? 'e.g. tennessee-records' : 'e.g. box-12'}
            disabled={busy}
            autoFocus
          />

          {error && (
            <p role="alert" className="rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/10 px-3 py-2 text-sm text-brand-burgundy-light">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy} className="rounded-xl border-brand-gold/20 text-brand-cream">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !finalStorageName('clean', value)}
              className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Creating" /> : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
