'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Collection } from '@/lib/types';

interface AdminCollectionEditModalProps {
  collection: Collection;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminCollectionEditModal({
  collection,
  onClose,
  onSaved,
}: AdminCollectionEditModalProps) {
  const [name, setName] = useState(collection.name);
  const [shortDescription, setShortDescription] = useState(collection.short_description || '');
  const [longDescription, setLongDescription] = useState(collection.long_description || '');
  const [sortOrder, setSortOrder] = useState<string>(String(collection.sort_order ?? 0));

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const generateDescriptions = async () => {
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-descriptions',
          name,
          category: collection.category,
          era: collection.era,
          region: collection.region,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to generate');
      } else {
        if (data.shortDescription) setShortDescription(data.shortDescription);
        if (data.longDescription) setLongDescription(data.longDescription);
        toast.success('Descriptions generated');
      }
    } catch {
      toast.error('Failed to generate descriptions');
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    const parsedSort = parseInt(sortOrder, 10);
    const updates = {
      name: name.trim(),
      short_description: shortDescription.trim() || null,
      long_description: longDescription.trim() || null,
      sort_order: Number.isFinite(parsedSort) ? parsedSort : collection.sort_order,
    };

    try {
      const res = await fetch(`/api/admin/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[collection-edit] update failed', data);
        toast.error(data.error || 'Failed to save');
        setSaving(false);
        return;
      }
      toast.success('Collection updated');
      setSaving(false);
      onSaved();
    } catch (err) {
      console.error('[collection-edit] network error', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gold/[0.08] flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-brand-cream">
              Edit Collection
            </h2>
            <p className="text-xs text-brand-muted font-mono truncate mt-0.5">
              {collection.slug}
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
        <div className="px-6 py-5 overflow-y-auto space-y-5">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              className="bg-brand-card border-brand-gold/[0.15]"
            />
          </div>

          <div className="space-y-3 border-t border-brand-gold/[0.08] pt-4">
            <div className="flex items-center justify-between">
              <Label>Descriptions</Label>
              <Button
                onClick={generateDescriptions}
                disabled={!name.trim() || generating}
                variant="outline"
                className="border-brand-gold/20 text-brand-gold hover:text-brand-gold-light rounded-xl text-xs h-8"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Generate with AI
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-brand-muted">Short Description (one line)</Label>
              <Input
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="One-sentence summary shown on collection cards"
                className="bg-brand-card border-brand-gold/[0.15]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-brand-muted">Long Description (paragraph)</Label>
              <textarea
                value={longDescription}
                onChange={(e) => setLongDescription(e.target.value)}
                placeholder="Several sentences describing the collection's contents, scope, and provenance"
                rows={5}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.15] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25 resize-y"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-brand-gold/[0.08] pt-4">
            <Label>Sort Order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="bg-brand-card border-brand-gold/[0.15] max-w-[150px]"
            />
            <p className="text-[11px] text-brand-muted">
              Lower numbers appear first within the same parent.
            </p>
          </div>
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
            disabled={saving || !name.trim()}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
