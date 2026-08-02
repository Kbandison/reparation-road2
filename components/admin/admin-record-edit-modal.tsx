'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  FolderOpen,
  Loader2,
  Trash2,
  ImageIcon,
  Quote,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildImageUrl } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { StorageBrowser } from '@/components/admin/storage-browser';
import type { Collection, CollectionRecord } from '@/lib/types';

interface AdminRecordEditModalProps {
  collection: Collection;
  record: CollectionRecord | null;
  columns: string[];
  onClose: () => void;
  onSaved: () => void;
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'collection_tag']);
const IMAGE_FIELDS = new Set(['image_path', 'image_url']);
const LONG_TEXT_FIELDS = new Set([
  'ocr_text',
  'transcription',
  'notes',
  'description',
  'long_description',
]);

export function AdminRecordEditModal({
  collection,
  record,
  columns,
  onClose,
  onSaved,
}: AdminRecordEditModalProps) {
  const supabase = createClient();
  const isNew = !record;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    columns.forEach((col) => {
      if (SYSTEM_FIELDS.has(col)) return;
      vals[col] = record?.[col] != null ? String(record[col]) : '';
    });
    return vals;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Per-record citation / source override.
  const [citationOverride, setCitationOverride] = useState('');
  const [sourceOverride, setSourceOverride] = useState('');
  const [initialCitation, setInitialCitation] = useState('');
  const [initialSource, setInitialSource] = useState('');
  const [citationOpen, setCitationOpen] = useState(false);

  // Storage browser visibility
  const [storageOpen, setStorageOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageField = columns.find((c) => IMAGE_FIELDS.has(c));

  // Extract bucket and folder from an image path.
  // Handles both full URLs like "https://xxx.supabase.co/storage/v1/object/public/bucket/folder/file.jpg"
  // and relative paths like "bucket/folder/file.jpg"
  const parseBucketFromPath = (path: string): { bucket: string; folder: string } | null => {
    if (!path) return null;

    let storagePath = path;
    // If it's a full Supabase storage URL, extract the path after /storage/v1/object/public/
    const marker = '/storage/v1/object/public/';
    const markerIdx = path.indexOf(marker);
    if (markerIdx !== -1) {
      storagePath = path.substring(markerIdx + marker.length);
    } else if (path.startsWith('http')) {
      return null;
    }

    // storagePath is now "bucket/folder/file.jpg"
    const parts = storagePath.split('/');
    if (parts.length >= 2) {
      return { bucket: parts[0], folder: parts.slice(1, -1).join('/') };
    }
    return null;
  };

  const handleChange = (col: string, value: string) => {
    setValues((prev) => ({ ...prev, [col]: value }));
  };

  const handleSave = async () => {
    if (!collection.table_name) return;
    setSaving(true);
    setError(null);

    const payload: Record<string, string> = {};
    Object.entries(values).forEach(([key, val]) => {
      if (SYSTEM_FIELDS.has(key)) return;
      if (isNew || val !== String(record?.[key] ?? '')) {
        payload[key] = val;
      }
    });

    let recordId = record?.id ?? '';

    if (isNew) {
      const res = await fetch('/api/admin/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: collection.table_name, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Insert failed');
        setSaving(false);
        return;
      }
      recordId = data.record?.id ?? '';
    } else {
      if (Object.keys(payload).length > 0) {
        const res = await fetch('/api/admin/records', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableName: collection.table_name, id: record.id, payload }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Update failed');
          setSaving(false);
          return;
        }
      }
    }

    // Save the citation / source override (needs the record id, now known even
    // for a freshly-inserted record).
    if (recordId) {
      const citErr = await saveCitationOverride(recordId);
      if (citErr) {
        setError(citErr);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageField) return;

    setUploading(true);
    setError(null);

    // Detect bucket from current record, or query for one
    let info = record?.[imageField]
      ? parseBucketFromPath(String(record[imageField]))
      : null;

    if (!info && collection.table_name && imageField) {
      const { data } = await supabase
        .from(collection.table_name)
        .select(imageField)
        .not(imageField, 'is', null)
        .not(imageField, 'eq', '')
        .limit(1)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (data as any)?.[imageField];
      if (val) {
        info = parseBucketFromPath(String(val));
      }
    }

    const bucket = info?.bucket || collection.table_name?.replace(/_/g, '-') || 'collection-images';
    const folder = info?.folder || '';
    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    // Store as full Supabase storage URL to match existing data format
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    handleChange(imageField, urlData.publicUrl);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (storageOpen) setStorageOpen(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, storageOpen]);

  // Load any existing per-record citation/source override for this record.
  useEffect(() => {
    if (isNew || !record?.id || !collection.table_name) return;
    let active = true;
    supabase
      .from('record_citations')
      .select('citation, source_information')
      .eq('table_name', collection.table_name)
      .eq('record_id', record.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setCitationOverride(data.citation || '');
        setSourceOverride(data.source_information || '');
        setInitialCitation(data.citation || '');
        setInitialSource(data.source_information || '');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, collection.table_name]);

  // Persist the citation/source override when it changed. Returns an error
  // message on failure, or null on success / no-op.
  const saveCitationOverride = async (recordId: string): Promise<string | null> => {
    if (citationOverride === initialCitation && sourceOverride === initialSource) {
      return null;
    }
    const res = await fetch('/api/admin/record-citation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName: collection.table_name,
        recordId,
        citation: citationOverride,
        sourceInformation: sourceOverride,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || 'Citation save failed';
    }
    return null;
  };

  const editableColumns = columns.filter(
    (c) => !SYSTEM_FIELDS.has(c) && !IMAGE_FIELDS.has(c)
  );
  const currentImageUrl =
    imageField && values[imageField]
      ? buildImageUrl(values[imageField], { width: 1200 })
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gold/[0.08] flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            {isNew ? 'Add Record' : 'Edit Record'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Image section */}
          {imageField && collection.has_images && (
            <div className="space-y-3 pb-5 border-b border-brand-gold/[0.08]">
              <label className="text-xs text-brand-muted font-medium uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Image
              </label>

              {currentImageUrl && (
                <div className="relative w-full max-h-56 rounded-xl overflow-hidden bg-brand-card flex items-center justify-center">
                  {/* Using <img> to avoid Next.js image optimizer issues with special chars in filenames */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentImageUrl}
                    alt="Record image"
                    className="max-h-56 w-auto object-contain"
                  />
                  <button
                    onClick={() => handleChange(imageField, '')}
                    className="absolute top-2 right-2 p-1.5 bg-brand-bg/80 rounded-lg hover:bg-brand-burgundy/20 text-brand-muted hover:text-brand-burgundy transition-colors"
                    title="Remove image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="border-brand-gold/20 text-brand-cream"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload from Computer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStorageOpen((o) => !o)}
                  className="border-brand-gold/20 text-brand-cream"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {storageOpen ? 'Hide Storage' : 'Browse Storage'}
                </Button>
              </div>

              {/* Storage browser — every bucket, navigate folders freely */}
              {storageOpen && imageField && (
                <StorageBrowser
                  selectedValue={values[imageField] ?? ''}
                  onPick={(path) => {
                    handleChange(imageField, path);
                    setStorageOpen(false);
                  }}
                  onClose={() => setStorageOpen(false)}
                />
              )}

              <input
                value={values[imageField] ?? ''}
                onChange={(e) => handleChange(imageField, e.target.value)}
                placeholder="Or enter image path manually..."
                className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-xs text-brand-muted placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-gold/30 font-mono"
              />
            </div>
          )}

          {/* All editable fields */}
          {editableColumns.map((col) => {
            const isLongText =
              LONG_TEXT_FIELDS.has(col) || (values[col]?.length || 0) > 200;

            return (
              <div key={col} className="space-y-1.5">
                <label className="text-xs text-brand-muted font-medium uppercase tracking-wide">
                  {snakeCaseToTitleCase(col)}
                </label>
                {isLongText ? (
                  <textarea
                    value={values[col] ?? ''}
                    onChange={(e) => handleChange(col, e.target.value)}
                    rows={4}
                    className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30 resize-y"
                  />
                ) : (
                  <input
                    value={values[col] ?? ''}
                    onChange={(e) => handleChange(col, e.target.value)}
                    className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30"
                  />
                )}
              </div>
            );
          })}

          {/* Citation & source override */}
          <div className="border-t border-brand-gold/[0.08] pt-5">
            <button
              type="button"
              onClick={() => setCitationOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 text-xs text-brand-muted font-medium uppercase tracking-wide hover:text-brand-cream transition-colors"
            >
              {citationOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <Quote className="w-3.5 h-3.5" />
              Citation &amp; Source
              {(citationOverride || sourceOverride) && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold normal-case tracking-normal">
                  Custom
                </span>
              )}
            </button>

            {citationOpen && (
              <div className="mt-3 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-brand-muted font-medium uppercase tracking-wide">
                    Citation override
                  </label>
                  <textarea
                    value={citationOverride}
                    onChange={(e) => setCitationOverride(e.target.value)}
                    rows={3}
                    placeholder="Leave blank to use the collection's citation format."
                    className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/30 resize-y"
                  />
                  <p className="text-[11px] text-brand-muted">
                    Replaces the auto-generated citation for this record only.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-brand-muted font-medium uppercase tracking-wide">
                    Source information
                  </label>
                  <textarea
                    value={sourceOverride}
                    onChange={(e) => setSourceOverride(e.target.value)}
                    rows={3}
                    placeholder={
                      collection.source_information
                        ? `Leave blank to use the collection source:\n${collection.source_information}`
                        : 'Repository, record group, physical reference…'
                    }
                    className="w-full bg-brand-bg border border-brand-gold/[0.08] rounded-xl px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-gold/30 resize-y"
                  />
                  <p className="text-[11px] text-brand-muted">
                    {collection.source_information
                      ? 'Overrides the collection source for this record only.'
                      : 'No collection-level source is set yet (edit it on the collection page).'}
                  </p>
                </div>
              </div>
            )}
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
            className="border-brand-gold/20 text-brand-cream"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isNew ? 'Add Record' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
