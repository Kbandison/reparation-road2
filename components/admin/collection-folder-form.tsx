'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FolderPlus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { collectionCategories, collectionEras, collectionRegions } from '@/lib/constants';
import { folderOptions } from '@/lib/collections/folders';
import type { ImportCollection } from '@/lib/collections/queries';

export interface CreatedFolder {
  slug: string;
  name: string;
  parentSlug: string | null;
}

interface CollectionFolderFormProps {
  collections: ImportCollection[];
  /** Folder the new one starts inside, if any. */
  defaultParentSlug?: string;
  /** Category, era, region and tier to start from (e.g. the collection being set up alongside it). */
  defaults?: { category?: string; era?: string; region?: string; accessTier?: string };
  onCreated: (folder: CreatedFolder) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

const selectClass =
  'w-full rounded-xl border border-brand-gold/[0.15] bg-brand-card px-3 py-2 text-sm text-brand-cream focus:border-brand-gold/40 focus:outline-none';

const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * A new folder: a collection that holds other collections as tabs, never
 * records. Same fields the existing folders use, and live right away (an
 * empty folder shows "Coming Soon" until it gets a tab).
 */
export function CollectionFolderForm({
  collections,
  defaultParentSlug = '',
  defaults,
  onCreated,
  onCancel,
  cancelLabel = 'Back',
}: CollectionFolderFormProps) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    parentSlug: defaultParentSlug,
    shortDescription: '',
    longDescription: '',
    category: defaults?.category || 'legal',
    era: defaults?.era || '',
    region: defaults?.region || '',
    accessTier: defaults?.accessTier || 'explorer',
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parents = useMemo(() => folderOptions(collections), [collections]);
  const slugTaken = !!form.slug && collections.some((c) => c.slug === form.slug);
  const slugInvalid = !!form.slug && !/^[a-z0-9][a-z0-9-]*$/.test(form.slug);
  const ready = form.name.trim() && form.slug && !slugTaken && !slugInvalid && form.shortDescription.trim();

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const generate = async () => {
    if (!form.name.trim()) return toast.error('Enter a name first');
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-descriptions',
          kind: 'folder',
          name: form.name,
          category: form.category,
          era: form.era,
          region: form.region,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'Failed to generate');
      set({
        shortDescription: data.shortDescription || form.shortDescription,
        longDescription: data.longDescription || form.longDescription,
      });
      toast.success('Descriptions generated');
    } catch {
      toast.error('Failed to generate descriptions');
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-collection',
          displayType: 'folder',
          slug: form.slug,
          name: form.name.trim(),
          shortDescription: form.shortDescription.trim(),
          longDescription: form.longDescription.trim(),
          category: form.category,
          era: form.era || null,
          region: form.region || null,
          parentSlug: form.parentSlug || null,
          accessTier: form.accessTier,
          isPublished: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not create the folder');
        return;
      }
      toast.success(`Folder “${form.name.trim()}” created`);
      onCreated({ slug: form.slug, name: form.name.trim(), parentSlug: form.parentSlug || null });
    } catch {
      setError('Could not create the folder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder name</Label>
          <Input
            id="folder-name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value, ...(slugEdited ? {} : { slug: toSlug(e.target.value) }) })}
            placeholder="e.g. Tennessee State Records"
            className="bg-brand-card border-brand-gold/[0.15]"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-slug">Slug</Label>
          <Input
            id="folder-slug"
            value={form.slug}
            onChange={(e) => {
              setSlugEdited(true);
              set({ slug: e.target.value.toLowerCase() });
            }}
            placeholder="e.g. tn-state-records"
            aria-invalid={slugTaken || slugInvalid}
            aria-describedby={slugTaken || slugInvalid ? 'folder-slug-error' : undefined}
            className="bg-brand-card border-brand-gold/[0.15] font-mono"
          />
          {(slugTaken || slugInvalid) && (
            <p id="folder-slug-error" className="text-[11px] text-brand-burgundy-light">
              {slugTaken ? 'A collection already uses this slug.' : 'Lowercase letters, numbers and hyphens only.'}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="folder-parent">Inside</Label>
        <select id="folder-parent" value={form.parentSlug} onChange={(e) => set({ parentSlug: e.target.value })} className={selectClass}>
          <option value="">Top level (its own card on the Collections page)</option>
          {parents.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="folder-category">Category</Label>
          <select id="folder-category" value={form.category} onChange={(e) => set({ category: e.target.value })} className={selectClass}>
            {collectionCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-era">Era</Label>
          <select id="folder-era" value={form.era} onChange={(e) => set({ era: e.target.value })} className={selectClass}>
            <option value="">None</option>
            {collectionEras.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-region">Region</Label>
          <select id="folder-region" value={form.region} onChange={(e) => set({ region: e.target.value })} className={selectClass}>
            <option value="">None</option>
            {collectionRegions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-tier">Access tier</Label>
          <select id="folder-tier" value={form.accessTier} onChange={(e) => set({ accessTier: e.target.value })} className={selectClass}>
            <option value="free">Free</option>
            <option value="explorer">Explorer (Premium)</option>
            <option value="scholar">Scholar</option>
          </select>
        </div>
      </div>

      <div className="space-y-3 border-t border-brand-gold/[0.08] pt-4">
        <div className="flex items-center justify-between gap-3">
          <Label>Descriptions</Label>
          <Button
            type="button"
            onClick={generate}
            disabled={!form.name.trim() || generating}
            variant="outline"
            className="h-8 rounded-xl border-brand-gold/20 text-xs text-brand-gold hover:text-brand-gold-light"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />}
            Generate with AI
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-short" className="text-xs text-brand-muted">Short description (one line, shown on its card)</Label>
          <Input
            id="folder-short"
            value={form.shortDescription}
            onChange={(e) => set({ shortDescription: e.target.value })}
            placeholder="e.g. Records of free and enslaved people from Tennessee"
            className="bg-brand-card border-brand-gold/[0.15]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="folder-long" className="text-xs text-brand-muted">Long description (optional)</Label>
          <textarea
            id="folder-long"
            value={form.longDescription}
            onChange={(e) => set({ longDescription: e.target.value })}
            rows={3}
            placeholder="What the collections in this folder have in common: the kinds of records, period and place"
            className="w-full resize-y rounded-xl border border-brand-gold/[0.15] bg-brand-card px-3 py-2 text-sm text-brand-cream focus:border-brand-gold/25 focus:outline-none"
          />
        </div>
      </div>

      <p className="text-[11px] text-brand-muted">
        Goes live right away. Until a collection is added inside it, its page shows “Coming Soon”.
      </p>

      {error && (
        <p role="alert" className="rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/10 px-3 py-2 text-sm text-brand-burgundy-light">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="rounded-xl border-brand-gold/20 text-brand-cream">
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={!ready || saving} className="rounded-xl bg-brand-gold text-brand-bg hover:bg-brand-gold-light">
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <FolderPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />}
          Create folder
        </Button>
      </div>
    </form>
  );
}
