'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Upload, Loader2, Check, X, ImagePlus, Copy, FolderPlus, AlertCircle, RefreshCw,
  FolderOpen, ChevronRight, CornerLeftUp, Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

interface Bucket {
  name: string;
  public: boolean;
}

interface CollectionOption {
  slug: string;
  name: string;
  table_name: string;
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
interface QueuedFile {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  path?: string;
  publicUrl?: string;
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|tiff?|avif)$/i;

// Run tasks with a small concurrency cap.
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

function cleanSegment(s: string) {
  return s.trim().replace(/^\/+|\/+$/g, '');
}

export function ImageUploader({ collections = [] }: { collections?: CollectionOption[] }) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [bucket, setBucket] = useState('');
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketPublic, setNewBucketPublic] = useState(true);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Folder navigation
  const [subfolders, setSubfolders] = useState<string[]>([]);
  const [existingCount, setExistingCount] = useState(0);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [newFolder, setNewFolder] = useState('');

  // Attach-to-records
  const [attachTable, setAttachTable] = useState('');
  const [attachCols, setAttachCols] = useState<string[]>([]);
  const [matchColumn, setMatchColumn] = useState('');
  const [loadingCols, setLoadingCols] = useState(false);
  const [attaching, setAttaching] = useState(false);

  async function loadBuckets(select?: string) {
    setLoadingBuckets(true);
    try {
      const res = await fetch('/api/admin/import?action=storage-buckets');
      const data = await res.json();
      const list: Bucket[] = data.buckets ?? [];
      setBuckets(list);
      if (select) setBucket(select);
      else if (!bucket && list.length > 0) setBucket(list[0].name);
    } catch {
      toast.error('Could not load storage buckets');
    } finally {
      setLoadingBuckets(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch('/api/admin/import?action=storage-buckets').catch(() => null);
      if (!active || !res) { setLoadingBuckets(false); return; }
      const data = await res.json();
      const list: Bucket[] = data.buckets ?? [];
      if (!active) return;
      setBuckets(list);
      if (list.length > 0) setBucket(list[0].name);
      setLoadingBuckets(false);
    })();
    return () => { active = false; };
  }, []);

  // Load the folders/file count at the current bucket + folder for navigation.
  const loadFolders = useCallback(async (b: string, f: string) => {
    if (!b) { setSubfolders([]); setExistingCount(0); return; }
    setLoadingFolders(true);
    try {
      const params = new URLSearchParams({ bucket: b });
      if (f) params.set('folder', f);
      const res = await fetch(`/api/admin/import?action=storage-files&${params}`);
      const data = await res.json();
      const items: { name: string; isFolder: boolean }[] = data.items ?? [];
      setSubfolders(items.filter((i) => i.isFolder).map((i) => i.name));
      setExistingCount(items.filter((i) => !i.isFolder).length);
    } catch {
      setSubfolders([]);
      setExistingCount(0);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => { loadFolders(bucket, folder); }, [bucket, folder, loadFolders]);
  // Reset to bucket root whenever the bucket changes.
  useEffect(() => { setFolder(''); }, [bucket]);

  async function createBucket() {
    if (!newBucketName.trim()) return;
    setCreatingBucket(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-bucket', name: newBucketName, public: newBucketPublic }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create bucket'); return; }
      toast.success(`Bucket “${data.name}” ready`);
      setShowNewBucket(false);
      setNewBucketName('');
      await loadBuckets(data.name);
    } finally {
      setCreatingBucket(false);
    }
  }

  const folderParts = folder ? folder.split('/').filter(Boolean) : [];
  function goToCrumb(index: number) {
    setFolder(index < 0 ? '' : folderParts.slice(0, index + 1).join('/'));
  }
  function enterFolder(name: string) {
    setFolder(folder ? `${folder}/${name}` : name);
  }
  function addFolder() {
    const seg = cleanSegment(newFolder).replace(/[^a-z0-9._/-]/gi, '-');
    if (!seg) return;
    setFolder(folder ? `${folder}/${seg}` : seg);
    setNewFolder('');
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => IMAGE_RE.test(f.name) || f.type.startsWith('image/'));
    const skipped = list.length - imgs.length;
    if (skipped > 0) toast.info(`${skipped} non-image file${skipped === 1 ? '' : 's'} skipped`);
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => p.file.name + p.file.size));
      const additions = imgs
        .filter((f) => !existing.has(f.name + f.size))
        .map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, file: f, status: 'pending' as FileStatus }));
      return [...prev, ...additions];
    });
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function update(id: string, patch: Partial<QueuedFile>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function uploadAll() {
    if (!bucket) { toast.error('Choose a bucket first'); return; }
    const queue = files.filter((f) => f.status === 'pending' || f.status === 'error');
    if (queue.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    const cleanFolder = cleanSegment(folder);
    let ok = 0;
    let failed = 0;

    await pool(queue, 4, async (qf) => {
      update(qf.id, { status: 'uploading', error: undefined });
      try {
        const path = cleanFolder ? `${cleanFolder}/${qf.file.name}` : qf.file.name;
        // 1) Ask the server (admin-gated) for a signed upload URL.
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signed-upload-url', bucket, path }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not get upload URL');
        // 2) Upload the file straight to Storage (no size limit through Vercel).
        const { error } = await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(data.path, data.token, qf.file, {
            contentType: qf.file.type || undefined,
            upsert: true,
          });
        if (error) throw error;
        ok += 1;
        update(qf.id, { status: 'done', path: `${bucket}/${data.path}`, publicUrl: data.publicUrl });
      } catch (e) {
        failed += 1;
        update(qf.id, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    });

    setUploading(false);
    if (ok) toast.success(`Uploaded ${ok} image${ok === 1 ? '' : 's'}`);
    if (failed) toast.error(`${failed} upload${failed === 1 ? '' : 's'} failed`);
    // Refresh the folder view so newly-created folders/counts show up.
    loadFolders(bucket, folder);
  }

  // Load the columns of the chosen collection's table so the admin can pick
  // which one to match filenames against.
  async function chooseTable(table: string) {
    setAttachTable(table);
    setAttachCols([]);
    setMatchColumn('');
    if (!table) return;
    setLoadingCols(true);
    try {
      const res = await fetch(`/api/admin/import?action=schema&table=${encodeURIComponent(table)}`);
      const data = await res.json();
      const cols: string[] = data.columns ?? [];
      // image_path is always present on imported tables; make sure it's offered.
      const all = Array.from(new Set(['image_path', ...cols]));
      setAttachCols(all);
      setMatchColumn(all.includes('image_path') ? 'image_path' : all[0] || '');
    } catch {
      toast.error('Could not load table columns');
    } finally {
      setLoadingCols(false);
    }
  }

  async function attachToRecords() {
    const done = files.filter((f) => f.status === 'done' && f.path);
    if (!attachTable) { toast.error('Choose a collection first'); return; }
    if (done.length === 0) { toast.error('Upload some images first'); return; }
    setAttaching(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'attach-images',
          tableName: attachTable,
          matchColumn: matchColumn || 'image_path',
          files: done.map((f) => ({ name: f.file.name, path: f.path })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Attach failed'); return; }
      if (data.updated > 0) {
        toast.success(`Linked ${data.updated} record${data.updated === 1 ? '' : 's'} to ${data.matchedFiles} image${data.matchedFiles === 1 ? '' : 's'}`);
      } else {
        toast.warning('No records matched — check the match column');
      }
      if (data.unmatched?.length) {
        const n = data.unmatched.length;
        toast.info(`${n} image${n === 1 ? '' : 's'} matched no record${n === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Attach failed');
    } finally {
      setAttaching(false);
    }
  }

  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;
  const selectedBucket = buckets.find((b) => b.name === bucket);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Bucket */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 space-y-4">
        <div className="space-y-2 max-w-sm">
          <Label className="flex items-center justify-between">
            Bucket
            <button
              onClick={() => loadBuckets()}
              className="text-brand-muted hover:text-brand-gold"
              aria-label="Refresh buckets"
              type="button"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBuckets ? 'animate-spin' : ''}`} />
            </button>
          </Label>
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="w-full bg-brand-bg border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
          >
            {buckets.length === 0 && <option value="">No buckets</option>}
            {buckets.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name} {b.public ? '(public)' : '(private)'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewBucket((s) => !s)}
            className="text-xs text-brand-gold hover:text-brand-gold-light inline-flex items-center gap-1"
          >
            <FolderPlus className="w-3.5 h-3.5" /> New bucket
          </button>
        </div>

        {showNewBucket && (
          <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-brand-gold/[0.06]">
            <div className="space-y-1">
              <Label className="text-xs">New bucket name</Label>
              <Input
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="my-images"
                className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold h-9 w-56"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-cream cursor-pointer pb-2">
              <input type="checkbox" checked={newBucketPublic} onChange={(e) => setNewBucketPublic(e.target.checked)} className="accent-brand-gold" />
              Public
            </label>
            <Button onClick={createBucket} disabled={creatingBucket || !newBucketName.trim()} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl h-9">
              {creatingBucket ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        )}

        {/* Folder navigation */}
        <div className="pt-3 border-t border-brand-gold/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <Label className="mb-0">Destination folder</Label>
            {loadingFolders && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-muted" />}
          </div>

          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => goToCrumb(-1)}
              className={`px-2 py-1 rounded-lg hover:bg-brand-bg transition-colors ${folderParts.length === 0 ? 'text-brand-gold' : 'text-brand-muted hover:text-brand-cream'}`}
            >
              {bucket || 'bucket'}
            </button>
            {folderParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 text-brand-muted" />
                <button
                  type="button"
                  onClick={() => goToCrumb(i)}
                  className={`px-2 py-1 rounded-lg hover:bg-brand-bg transition-colors ${i === folderParts.length - 1 ? 'text-brand-gold' : 'text-brand-muted hover:text-brand-cream'}`}
                >
                  {part}
                </button>
              </span>
            ))}
          </div>

          {/* Subfolders */}
          <div className="rounded-xl border border-brand-gold/[0.08] bg-brand-bg/40 divide-y divide-brand-gold/[0.04] max-h-44 overflow-y-auto">
            {folder && (
              <button
                type="button"
                onClick={() => goToCrumb(folderParts.length - 2)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-muted hover:text-brand-cream hover:bg-brand-bg transition-colors"
              >
                <CornerLeftUp className="w-3.5 h-3.5" /> ..
              </button>
            )}
            {subfolders.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => enterFolder(name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-cream hover:bg-brand-bg transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                <span className="truncate">{name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-brand-muted ml-auto shrink-0" />
              </button>
            ))}
            {!folder && subfolders.length === 0 && !loadingFolders && (
              <p className="px-3 py-2 text-xs text-brand-muted">No sub-folders here.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Input
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFolder(); } }}
                placeholder="new-folder-name"
                className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold h-9 w-52"
              />
              <Button type="button" variant="outline" onClick={addFolder} disabled={!newFolder.trim()} className="h-9 rounded-xl border-brand-gold/[0.25]">
                <FolderPlus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
            <p className="text-[11px] text-brand-muted">
              {existingCount > 0 ? `${existingCount} file${existingCount === 1 ? '' : 's'} here · ` : ''}
              uploads go to <span className="text-brand-cream font-mono">{bucket || 'bucket'}/{cleanSegment(folder) ? cleanSegment(folder) + '/' : ''}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-brand-gold bg-brand-gold/[0.06]' : 'border-brand-gold/30 hover:border-brand-gold/50 bg-brand-bg/40'
        }`}
      >
        <ImagePlus className="w-8 h-8 text-brand-gold mx-auto mb-2" />
        <p className="text-sm text-brand-cream">Drop images here, or click to choose</p>
        <p className="text-xs text-brand-muted mt-1">JPEG, PNG, WebP, TIFF… large scans OK (uploaded directly to Storage)</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.tif,.tiff"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
        />
      </div>

      {/* Queue */}
      {files.length > 0 && (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.08]">
            <p className="text-sm text-brand-cream">
              {files.length} file{files.length === 1 ? '' : 's'}
              {doneCount > 0 && <span className="text-brand-sage"> · {doneCount} done</span>}
              {errorCount > 0 && <span className="text-brand-burgundy-light"> · {errorCount} failed</span>}
            </p>
            <button
              onClick={() => setFiles((p) => p.filter((f) => f.status !== 'done'))}
              className="text-xs text-brand-muted hover:text-brand-cream"
              type="button"
            >
              Clear done
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-brand-gold/[0.04]">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="shrink-0">
                  {f.status === 'done' ? <Check className="w-4 h-4 text-brand-sage" />
                    : f.status === 'uploading' ? <Loader2 className="w-4 h-4 text-brand-gold animate-spin" />
                    : f.status === 'error' ? <AlertCircle className="w-4 h-4 text-brand-burgundy-light" />
                    : <ImagePlus className="w-4 h-4 text-brand-muted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-brand-cream truncate">{f.file.name}</p>
                  {f.status === 'error'
                    ? <p className="text-[11px] text-brand-burgundy-light truncate">{f.error}</p>
                    : f.status === 'done' && f.path
                      ? <p className="text-[11px] text-brand-muted truncate">{f.path}</p>
                      : <p className="text-[11px] text-brand-muted">{(f.file.size / 1024 / 1024).toFixed(1)} MB</p>}
                </div>
                {f.status === 'done' && f.path && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(f.path!); toast.success('Path copied'); }}
                    className="text-brand-muted hover:text-brand-gold shrink-0"
                    title="Copy storage path"
                    type="button"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
                {f.status !== 'uploading' && (
                  <button onClick={() => removeFile(f.id)} className="text-brand-muted hover:text-brand-burgundy-light shrink-0" type="button" aria-label="Remove">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="flex items-center gap-3">
        <Button
          onClick={uploadAll}
          disabled={uploading || !bucket || pendingCount === 0}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {uploading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4 mr-1.5" /> Upload {pendingCount || ''}</>}
        </Button>
        {selectedBucket && !selectedBucket.public && (
          <p className="text-xs text-brand-muted">This bucket is private — images won&apos;t be publicly viewable.</p>
        )}
      </div>

      {/* Attach to records */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-brand-cream">Attach to records (optional)</h3>
            <p className="text-xs text-brand-muted mt-0.5">
              After uploading, write each image&apos;s storage path onto matching records&apos; <span className="font-mono">image_path</span>. Matched by filename against the column you pick.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Collection</Label>
            <select
              value={attachTable}
              onChange={(e) => chooseTable(e.target.value)}
              className="w-full bg-brand-bg border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
            >
              <option value="">— Select a collection —</option>
              {collections.map((c) => (
                <option key={c.slug} value={c.table_name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Match filenames against
              {loadingCols && <Loader2 className="w-3 h-3 animate-spin text-brand-muted" />}
            </Label>
            <select
              value={matchColumn}
              onChange={(e) => setMatchColumn(e.target.value)}
              disabled={!attachTable || loadingCols}
              className="w-full bg-brand-bg border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none disabled:opacity-50"
            >
              {attachCols.length === 0 && <option value="">—</option>}
              {attachCols.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={attachToRecords}
            disabled={attaching || !attachTable || doneCount === 0}
            variant="outline"
            className="rounded-xl border-brand-gold/[0.25] text-brand-cream hover:bg-brand-gold/[0.08]"
          >
            {attaching ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Attaching…</> : <><Link2 className="w-4 h-4 mr-1.5" /> Attach {doneCount || ''} uploaded image{doneCount === 1 ? '' : 's'}</>}
          </Button>
          <p className="text-[11px] text-brand-muted">
            Tip: pick <span className="font-mono">image_path</span> to repair records whose image filename is already stored but broken.
          </p>
        </div>
      </div>
    </div>
  );
}
