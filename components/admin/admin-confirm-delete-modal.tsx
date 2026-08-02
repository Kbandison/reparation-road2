'use client';

import { useEffect, type ReactNode } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdminConfirmDeleteModalProps {
  title: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Destructive-action confirmation dialog. Mirrors the bulk-edit modal's shell
 * but with burgundy accents to signal a delete. `children` is the body copy.
 */
export function AdminConfirmDeleteModal({
  title,
  confirmLabel,
  busy = false,
  error = null,
  onConfirm,
  onClose,
  children,
}: AdminConfirmDeleteModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />

      <div className="relative bg-brand-bg border border-brand-burgundy/25 rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gold/[0.08] flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            {title}
          </h2>
          <button
            onClick={() => !busy && onClose()}
            className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream disabled:opacity-40"
            disabled={busy}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 bg-brand-burgundy/[0.08] border border-brand-burgundy/25 rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-brand-burgundy-light flex-shrink-0 mt-0.5" />
            <div className="text-sm text-brand-cream-muted leading-relaxed">
              {children}
            </div>
          </div>

          {error && (
            <div className="bg-brand-burgundy/10 border border-brand-burgundy/20 rounded-xl px-4 py-3 text-sm text-brand-burgundy-light">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-brand-gold/[0.08] flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="border-brand-gold/20 text-brand-cream rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="bg-brand-burgundy text-white hover:bg-brand-burgundy/85 rounded-xl"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
