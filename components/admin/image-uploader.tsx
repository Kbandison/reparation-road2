'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Upload, Loader2, Check, X, ImagePlus, Copy, FolderPlus, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

interface Bucket {
  name: string;
  public: boolean;
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

export function ImageUploader() {
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
        update(qf.id, { status: 'done', path: `${bucket}/${data.path}`, publicUrl: data.publicUrl });
      } catch (e) {
        update(qf.id, { status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    });

    setUploading(false);
    const done = files.filter((f) => f.status === 'done').length;
    toast.success(`Uploaded ${queue.filter((q) => files.find((f) => f.id === q.id)?.status !== 'error').length || done} image(s)`);
  }

  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const selectedBucket = buckets.find((b) => b.name === bucket);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Bucket + folder */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label>Folder (optional)</Label>
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. peter-ayrault"
              className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
            />
            <p className="text-[11px] text-brand-muted truncate">
              Path: <span className="text-brand-cream">{bucket || 'bucket'}/{cleanSegment(folder) ? cleanSegment(folder) + '/' : ''}&lt;filename&gt;</span>
            </p>
          </div>
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
          disabled={uploading || !bucket || files.filter((f) => f.status === 'pending' || f.status === 'error').length === 0}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {uploading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4 mr-1.5" /> Upload {files.filter((f) => f.status === 'pending' || f.status === 'error').length || ''}</>}
        </Button>
        {selectedBucket && !selectedBucket.public && (
          <p className="text-xs text-brand-muted">This bucket is private — images won&apos;t be publicly viewable.</p>
        )}
      </div>
    </div>
  );
}
