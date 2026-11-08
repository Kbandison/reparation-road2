'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DropTableDialogProps {
  /** The table to remove, or null when closed. */
  table: string | null;
  rows?: number | null;
  /** Why it's being removed, shown above the confirmation. */
  context?: string;
  onClose: () => void;
  onDropped: (table: string) => void;
}

/**
 * Confirms removing an unused records table by having the name typed out, then
 * removes it (/api/admin/tables re-checks that no collection uses it).
 */
export function DropTableDialog({ table, rows, context, onClose, onDropped }: DropTableDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const drop = async () => {
    if (!table || typed !== table) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tables', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, confirm: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Removing the table failed (${res.status})`);
      setBusy(false);
      setTyped('');
      onDropped(table);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removing the table failed');
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={table !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent className="bg-brand-bg border-brand-gold/[0.12] rounded-2xl text-brand-cream">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-brand-cream">Remove the table {table}?</AlertDialogTitle>
          <AlertDialogDescription className="text-brand-cream-muted">
            {context && <>{context} </>}
            No collection uses it.
            {typeof rows === 'number' && ` Its ${rows.toLocaleString()} record${rows === 1 ? '' : 's'} will be deleted with it.`}{' '}
            This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="drop-table-confirm" className="text-xs text-brand-muted">
            Type <span className="font-mono text-brand-cream">{table}</span> to confirm
          </label>
          <Input
            id="drop-table-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="bg-brand-card border-brand-gold/[0.15] font-mono"
          />
          {error && (
            <p className="text-xs text-brand-burgundy-light" role="alert">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="border-brand-gold/20 text-brand-cream rounded-xl">
            Cancel
          </AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open while it runs and can show an error. */}
          <Button
            type="button"
            onClick={drop}
            disabled={busy || typed !== table}
            className="bg-brand-burgundy text-brand-cream hover:bg-brand-burgundy/80 rounded-xl"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Remove table
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
