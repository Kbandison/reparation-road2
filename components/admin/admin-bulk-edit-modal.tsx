'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, FolderOpen, AlertTriangle } from 'lucide-react';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { StorageBrowser } from '@/components/admin/storage-browser';
import type { Collection } from '@/lib/types';

interface AdminBulkEditModalProps {
  collection: Collection;
  columns: string[];
  selectedIds: string[];
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
  onSaved: () => void;
}

const SYSTEM_FIELDS = new Set([
  'id',
  'slug',
  'created_at',
  'updated_at',
  'embedding',
  'tsv',
  'collection_tag',
]);
const IMAGE_FIELDS = new Set(['image_path', 'image_url']);

export function AdminBulkEditModal({
  collection,
  columns,
  selectedIds,
  selectAll,
  totalCount,
  onClose,
  onSaved,
}: AdminBulkEditModalProps) {
  const editableColumns = columns.filter((c) => !SYSTEM_FIELDS.has(c));

  const [column, setColumn] = useState<string>(editableColumns[0] || '');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);

  const affectedCount = selectAll ? totalCount : selectedIds.length;
  const isImageField = IMAGE_FIELDS.has(column);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (storageOpen) setStorageOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, storageOpen]);

  const handleSave = async () => {
    if (!collection.table_name || !column || affectedCount === 0) return;
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      [column]: value.trim() === '' ? null : value,
    };
    const body: Record<string, unknown> = {
      tableName: collection.table_name,
      payload,
    };
    if (selectAll) {
      body.all = true;
      body.discriminatorColumn = collection.discriminator_column;
      body.discriminatorValue = collection.discriminator_value;
    } else {
      body.ids = selectedIds;
    }

    try {
      const res = await fetch('/api/admin/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Bulk update failed');
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gold/[0.08] flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-semibold text-brand-cream">
              Bulk Edit
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
              {affectedCount.toLocaleString()} record
              {affectedCount === 1 ? '' : 's'} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Field picker */}
          <div className="space-y-1.5">
            <label className="text-xs text-brand-muted font-medium uppercase tracking-wide">
              Field to update
            </label>
            <select
              value={column}
              onChange={(e) => {
                setColumn(e.target.value);
                setStorageOpen(false);
              }}
              className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream focus:outline-none focus:border-brand-gold/30"
            >
              {editableColumns.map((c) => (
                <option key={c} value={c}>
                  {snakeCaseToTitleCase(c)}
                </option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <label className="text-xs text-brand-muted font-medium uppercase tracking-wide">
              New value
            </label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                isImageField
                  ? 'Image path / URL — or browse storage'
                  : 'Leave empty to clear the field'
              }
              className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30 font-mono"
            />
            {isImageField && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStorageOpen((o) => !o)}
                className="border-brand-gold/20 text-brand-cream mt-1"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {storageOpen ? 'Hide storage' : 'Browse Storage'}
              </Button>
            )}
          </div>

          {/* Storage browser — every bucket, navigate folders freely */}
          {isImageField && storageOpen && (
            <StorageBrowser
              selectedValue={value}
              onPick={(path) => {
                setValue(path);
                setStorageOpen(false);
              }}
              onClose={() => setStorageOpen(false)}
            />
          )}

          {/* Warning */}
          <div className="flex items-start gap-2 bg-brand-gold/[0.06] border border-brand-gold/15 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-brand-gold flex-shrink-0 mt-0.5" />
            <p className="text-xs text-brand-cream-muted leading-relaxed">
              This overwrites{' '}
              <span className="font-mono text-brand-gold">
                {snakeCaseToTitleCase(column)}
              </span>{' '}
              on{' '}
              <span className="font-semibold text-brand-cream">
                {affectedCount.toLocaleString()}
              </span>{' '}
              record{affectedCount === 1 ? '' : 's'} and cannot be undone.
            </p>
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
            disabled={saving}
            className="border-brand-gold/20 text-brand-cream rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !column || affectedCount === 0}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Updating…
              </>
            ) : (
              `Update ${affectedCount.toLocaleString()} record${affectedCount === 1 ? '' : 's'}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
