'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  Database,
} from 'lucide-react';

interface BucketInfo {
  name: string;
  public: boolean;
}

interface StorageItem {
  name: string;
  isFolder: boolean;
  // file: "bucket/relative/path" (ready for image_path) — folder: "relative/path"
  path: string;
  // file: public URL for previews — folder: ''
  url: string;
}

interface StorageBrowserProps {
  /** Called with the storage path (`bucket/relative/path`) when a file is picked. */
  onPick: (path: string) => void;
  onClose: () => void;
  /** The currently-selected value, highlighted in the grid if visible. */
  selectedValue?: string;
}

/**
 * Bucket-first storage browser — lists every storage bucket, then lets the
 * admin navigate folders freely (same flow as the import wizard). Built on the
 * shared /api/admin/import storage endpoints.
 */
export function StorageBrowser({ onPick, onClose, selectedValue }: StorageBrowserProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<BucketInfo[] | null>(null);
  const [bucket, setBucket] = useState(''); // '' → showing the bucket list
  const [folder, setFolder] = useState('');
  const [items, setItems] = useState<StorageItem[]>([]);

  const loadBuckets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/import?action=storage-buckets');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load buckets');
        setBuckets([]);
      } else {
        setBuckets(json.buckets || []);
      }
    } catch {
      setError('Failed to load buckets');
      setBuckets([]);
    }
    setLoading(false);
  }, []);

  const loadFiles = useCallback(async (b: string, f: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ bucket: b });
      if (f) params.set('folder', f);
      const res = await fetch(`/api/admin/import?action=storage-files&${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load files');
        setItems([]);
      } else {
        setItems(json.items || []);
        setBucket(b);
        setFolder(f);
      }
    } catch {
      setError('Failed to load files');
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  // Up one level — into the parent folder, or back to the bucket list at root.
  const goUp = () => {
    if (folder) {
      const parts = folder.split('/').filter(Boolean);
      parts.pop();
      loadFiles(bucket, parts.join('/'));
    } else {
      setBucket('');
      setFolder('');
      setItems([]);
    }
  };

  const folders = items.filter((i) => i.isFolder);
  const files = items.filter((i) => !i.isFolder);

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-3 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-brand-muted min-w-0">
          {bucket && (
            <button
              onClick={goUp}
              className="p-1 hover:bg-brand-card-hover rounded transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="truncate font-mono">
            {bucket ? `${bucket}${folder ? `/${folder}` : ''}` : 'All buckets'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-brand-muted hover:text-brand-cream flex-shrink-0 ml-2"
        >
          Close
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-brand-gold" />
        </div>
      ) : error ? (
        <p className="text-xs text-brand-burgundy-light py-4 text-center">{error}</p>
      ) : !bucket ? (
        <div className="space-y-0.5">
          {(buckets || []).length === 0 ? (
            <p className="text-xs text-brand-muted py-4 text-center">
              No storage buckets found.
            </p>
          ) : (
            (buckets || []).map((b) => (
              <button
                key={b.name}
                onClick={() => loadFiles(b.name, '')}
                className="w-full text-left px-3 py-1.5 text-sm text-brand-cream hover:bg-brand-card-hover rounded-lg transition-colors truncate flex items-center gap-2"
              >
                <Database className="w-3.5 h-3.5 text-brand-gold flex-shrink-0" />
                {b.name}
                <ChevronRight className="w-3 h-3 text-brand-muted ml-auto flex-shrink-0" />
              </button>
            ))
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-brand-muted py-4 text-center">
          This folder is empty.
        </p>
      ) : (
        <>
          {folders.length > 0 && (
            <div className="space-y-0.5 mb-3">
              {folders.map((item) => (
                <button
                  key={item.path}
                  onClick={() => loadFiles(bucket, item.path)}
                  className="w-full text-left px-3 py-1.5 text-sm text-brand-cream hover:bg-brand-card-hover rounded-lg transition-colors truncate flex items-center gap-2"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-brand-gold flex-shrink-0" />
                  {item.name}
                  <ChevronRight className="w-3 h-3 text-brand-muted ml-auto flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map((item) => {
                const isSelected = !!selectedValue && selectedValue === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => onPick(item.path)}
                    title={item.name}
                    className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-brand-gold ring-1 ring-brand-gold/30'
                        : 'border-transparent hover:border-brand-gold/30'
                    }`}
                  >
                    <div className="aspect-square bg-brand-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
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
  );
}
