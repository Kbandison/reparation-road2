'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  FolderOpen,
  Loader2,
  Trash2,
  ImageIcon,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildImageUrl } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import type { Collection, CollectionRecord } from '@/lib/types';

interface AdminRecordEditModalProps {
  collection: Collection;
  record: CollectionRecord | null;
  columns: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface StorageItem {
  name: string;
  isFolder: boolean;
  fullPath: string;
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding']);
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

  // Storage browser state
  const [browsingStorage, setBrowsingStorage] = useState(false);
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [storageBucket, setStorageBucket] = useState<string>('');
  const [storageFolder, setStorageFolder] = useState<string>('');
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

    if (isNew) {
      const { error: insertError } = await supabase
        .from(collection.table_name)
        .insert(payload);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    } else {
      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await supabase
          .from(collection.table_name)
          .update(payload)
          .eq('id', record.id);

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }
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

  const listStorageFolder = async (bucket: string, folder: string) => {
    setBrowsingStorage(true);
    setError(null);

    try {
      const params = new URLSearchParams({ bucket });
      if (folder) params.set('folder', folder);

      const res = await fetch(`/api/admin/storage?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(`Could not browse storage: ${json.error}`);
        setBrowsingStorage(false);
        return;
      }

      setStorageItems(json.items as StorageItem[]);
      setStorageBucket(json.bucket);
      setStorageFolder(json.folder);
      setBrowsingStorage(false);
      setStorageOpen(true);
    } catch {
      setError('Failed to connect to storage API');
      setBrowsingStorage(false);
    }
  };

  const openStorageBrowser = async () => {
    // 1. Try to detect bucket from current record's image path
    let info = imageField && record?.[imageField]
      ? parseBucketFromPath(String(record[imageField]))
      : null;

    // 2. If not found, query the collection table for any record with an image path
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

    // 3. Fallback: convert table_name underscores to hyphens (common Supabase bucket naming)
    const bucket = info?.bucket || collection.table_name?.replace(/_/g, '-') || 'collection-images';

    // Start at bucket root so admin can navigate into subfolders
    listStorageFolder(bucket, '');
  };

  const navigateToFolder = (folderPath: string) => {
    listStorageFolder(storageBucket, folderPath);
  };

  const navigateUp = () => {
    const parts = storageFolder.split('/').filter(Boolean);
    parts.pop();
    listStorageFolder(storageBucket, parts.join('/'));
  };

  const selectStorageFile = (path: string) => {
    if (imageField) {
      handleChange(imageField, path);
      setStorageOpen(false);
      setStorageItems([]);
    }
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
        if (storageOpen) {
          setStorageOpen(false);
          setStorageItems([]);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, storageOpen]);

  const editableColumns = columns.filter(
    (c) => !SYSTEM_FIELDS.has(c) && !IMAGE_FIELDS.has(c)
  );
  const currentImageUrl =
    imageField && values[imageField] ? buildImageUrl(values[imageField]) : null;

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

              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  onClick={openStorageBrowser}
                  disabled={browsingStorage}
                  className="border-brand-gold/20 text-brand-cream"
                >
                  {browsingStorage ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FolderOpen className="w-4 h-4 mr-2" />
                  )}
                  Browse Storage
                </Button>
              </div>

              {/* Storage browser with folder navigation */}
              {storageOpen && (
                <div className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-3 max-h-80 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs text-brand-muted min-w-0">
                      {storageFolder && (
                        <button
                          onClick={navigateUp}
                          className="p-1 hover:bg-brand-card-hover rounded transition-colors flex-shrink-0"
                          title="Go up"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className="truncate font-mono">
                        {storageBucket}
                        {storageFolder ? `/${storageFolder}` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setStorageOpen(false);
                        setStorageItems([]);
                      }}
                      className="text-xs text-brand-muted hover:text-brand-cream flex-shrink-0 ml-2"
                    >
                      Close
                    </button>
                  </div>
                  {storageItems.length === 0 ? (
                    <p className="text-xs text-brand-muted py-4 text-center">
                      No files found in this folder.
                    </p>
                  ) : (
                    <>
                      {/* Folders as a list */}
                      {storageItems.some((item) => item.isFolder) && (
                        <div className="space-y-0.5 mb-3">
                          {storageItems
                            .filter((item) => item.isFolder)
                            .map((item) => (
                              <button
                                key={item.fullPath}
                                onClick={() => navigateToFolder(item.fullPath)}
                                className="w-full text-left px-3 py-1.5 text-sm text-brand-cream hover:bg-brand-card-hover rounded-lg transition-colors truncate flex items-center gap-2"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-brand-gold flex-shrink-0" />
                                {item.name}
                                <ChevronRight className="w-3 h-3 text-brand-muted ml-auto flex-shrink-0" />
                              </button>
                            ))}
                        </div>
                      )}
                      {/* Files as a thumbnail grid */}
                      {storageItems.some((item) => !item.isFolder) && (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {storageItems
                            .filter((item) => !item.isFolder)
                            .map((item) => {
                              const isSelected =
                                imageField && values[imageField] === item.fullPath;
                              return (
                                <button
                                  key={item.fullPath}
                                  onClick={() => selectStorageFile(item.fullPath)}
                                  className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
                                    isSelected
                                      ? 'border-brand-gold ring-1 ring-brand-gold/30'
                                      : 'border-transparent hover:border-brand-gold/30'
                                  }`}
                                  title={item.name}
                                >
                                  <div className="aspect-square bg-brand-bg">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.fullPath}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  </div>
                                  <p className="text-[10px] text-brand-muted truncate px-1 py-0.5 bg-brand-bg/80">
                                    {item.name}
                                  </p>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                </div>
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
