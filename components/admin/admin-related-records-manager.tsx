'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  Star,
  Loader2,
} from 'lucide-react';
import type { Collection, RelatedRecord } from '@/lib/types';

interface ManagerProps {
  collections: Pick<Collection, 'slug' | 'name' | 'table_name'>[];
}

interface RecordOption {
  id: string;
  slug: string;
  name: string;
}

const RELATIONSHIP_SUGGESTIONS = [
  'Same person', 'Same family', 'Same household', 'Same owner',
  'Same location', 'Same regiment', 'Same event', 'Enslaver/Enslaved',
  'Parent/Child', 'Spouse', 'Sibling', 'Related by trade',
];

export function AdminRelatedRecordsManager({ collections }: ManagerProps) {
  const [records, setRecords] = useState<RelatedRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RelatedRecord | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const pageSize = 25;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);

    const res = await fetch(`/api/admin/related-records?${params}`);
    const data = await res.json();
    setRecords(data.records || []);
    setCount(data.count || 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/related-records?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeleting(null);
      fetchRecords();
    }
  };

  const totalPages = Math.ceil(count / pageSize);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search relationships..."
            className="w-full pl-10 pr-4 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/25"
          />
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-gold/10 text-brand-gold rounded-xl text-sm font-medium hover:bg-brand-gold/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Relationship
        </button>
      </div>

      {/* Table */}
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-gold/[0.08]">
                <th className="text-left px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide">Source</th>
                <th className="text-center px-2 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide w-8" />
                <th className="text-left px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide">Target</th>
                <th className="text-left px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide">Type</th>
                <th className="text-center px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide">Priority</th>
                <th className="text-center px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide">Flags</th>
                <th className="text-right px-4 py-3 text-[11px] text-brand-muted font-medium uppercase tracking-wide w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-brand-muted">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-brand-muted">
                    No relationships found
                  </td>
                </tr>
              ) : (
                records.map((rel) => (
                  <tr key={rel.id} className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-brand-cream truncate max-w-[200px]">{rel.source_name || rel.source_record_id}</p>
                      <p className="text-xs text-brand-muted">{rel.source_collection}</p>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <ArrowRight className="w-4 h-4 text-brand-muted mx-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-brand-cream truncate max-w-[200px]">{rel.target_name || rel.target_record_id}</p>
                      <p className="text-xs text-brand-muted">{rel.target_collection}</p>
                    </td>
                    <td className="px-4 py-3 text-brand-muted">{rel.relationship_type || '—'}</td>
                    <td className="px-4 py-3 text-center text-brand-muted">{rel.display_priority}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {rel.is_bidirectional && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-sage/10 text-brand-sage">Bi</span>
                        )}
                        {rel.is_featured && (
                          <Star className="w-3.5 h-3.5 text-brand-gold" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditing(rel); setShowModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(rel.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-brand-muted hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-brand-gold/[0.08]">
            <p className="text-xs text-brand-muted">{count} relationship{count !== 1 ? 's' : ''}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-brand-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <RelationshipModal
          collections={collections}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); fetchRecords(); }}
        />
      )}
    </div>
  );
}

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-display text-lg font-semibold text-brand-cream mb-2">Delete Relationship</h3>
        <p className="text-sm text-brand-muted mb-6">Are you sure? This cannot be undone.</p>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-brand-muted hover:text-brand-cream transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function RelationshipModal({
  collections,
  editing,
  onClose,
  onSaved,
}: {
  collections: Pick<Collection, 'slug' | 'name' | 'table_name'>[];
  editing: RelatedRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  // Source
  const [srcCollectionSlug, setSrcCollectionSlug] = useState(editing?.source_collection_slug || '');
  const [srcRecordId, setSrcRecordId] = useState(editing?.source_record_id || '');
  const [srcName, setSrcName] = useState(editing?.source_name || '');
  const [srcSearch, setSrcSearch] = useState('');
  const [srcResults, setSrcResults] = useState<RecordOption[]>([]);
  const [srcSearching, setSrcSearching] = useState(false);

  // Target
  const [tgtCollectionSlug, setTgtCollectionSlug] = useState(editing?.target_collection_slug || '');
  const [tgtRecordId, setTgtRecordId] = useState(editing?.target_record_id || '');
  const [tgtName, setTgtName] = useState(editing?.target_name || '');
  const [tgtSearch, setTgtSearch] = useState('');
  const [tgtResults, setTgtResults] = useState<RecordOption[]>([]);
  const [tgtSearching, setTgtSearching] = useState(false);

  // Relationship fields
  const [type, setType] = useState(editing?.relationship_type || '');
  const [note, setNote] = useState(editing?.relationship_note || '');
  const [priority, setPriority] = useState(editing?.display_priority ?? 0);
  const [bidirectional, setBidirectional] = useState(editing?.is_bidirectional ?? true);
  const [featured, setFeatured] = useState(editing?.is_featured ?? false);

  // Search records in a collection
  const searchRecords = async (
    slug: string,
    q: string,
    setResults: (r: RecordOption[]) => void,
    setSearching: (b: boolean) => void
  ) => {
    if (!slug || q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/related-records?action=search-records&collection=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setResults(data.records || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search for source
  useEffect(() => {
    const t = setTimeout(() => searchRecords(srcCollectionSlug, srcSearch, setSrcResults, setSrcSearching), 300);
    return () => clearTimeout(t);
  }, [srcCollectionSlug, srcSearch]);

  // Debounced search for target
  useEffect(() => {
    const t = setTimeout(() => searchRecords(tgtCollectionSlug, tgtSearch, setTgtResults, setTgtSearching), 300);
    return () => clearTimeout(t);
  }, [tgtCollectionSlug, tgtSearch]);

  const handleSave = async () => {
    setSaving(true);

    if (editing) {
      // PATCH
      await fetch('/api/admin/related-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          relationship_type: type || null,
          relationship_note: note || null,
          display_priority: priority,
          is_bidirectional: bidirectional,
          is_featured: featured,
          source_name: srcName || null,
          target_name: tgtName || null,
        }),
      });
    } else {
      // POST
      await fetch('/api/admin/related-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_record_id: srcRecordId,
          source_collection_slug: srcCollectionSlug,
          source_name: srcName || null,
          target_record_id: tgtRecordId,
          target_collection_slug: tgtCollectionSlug,
          target_name: tgtName || null,
          relationship_type: type || null,
          relationship_note: note || null,
          display_priority: priority,
          is_bidirectional: bidirectional,
          is_featured: featured,
        }),
      });
    }

    setSaving(false);
    onSaved();
  };

  const canSave = editing
    ? true
    : srcRecordId && srcCollectionSlug && tgtRecordId && tgtCollectionSlug;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-gold/[0.08]">
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            {editing ? 'Edit Relationship' : 'Add Relationship'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-card text-brand-muted hover:text-brand-cream">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Source Record */}
          <RecordPicker
            label="Source Record"
            collections={collections}
            selectedSlug={srcCollectionSlug}
            onSlugChange={(s) => { setSrcCollectionSlug(s); setSrcRecordId(''); setSrcName(''); setSrcResults([]); }}
            search={srcSearch}
            onSearchChange={setSrcSearch}
            results={srcResults}
            searching={srcSearching}
            selectedId={srcRecordId}
            selectedName={srcName}
            onSelect={(r) => { setSrcRecordId(r.id); setSrcName(r.name); setSrcSearch(''); setSrcResults([]); }}
            disabled={!!editing}
          />

          {/* Target Record */}
          <RecordPicker
            label="Target Record"
            collections={collections}
            selectedSlug={tgtCollectionSlug}
            onSlugChange={(s) => { setTgtCollectionSlug(s); setTgtRecordId(''); setTgtName(''); setTgtResults([]); }}
            search={tgtSearch}
            onSearchChange={setTgtSearch}
            results={tgtResults}
            searching={tgtSearching}
            selectedId={tgtRecordId}
            selectedName={tgtName}
            onSelect={(r) => { setTgtRecordId(r.id); setTgtName(r.name); setTgtSearch(''); setTgtResults([]); }}
            disabled={!!editing}
          />

          {/* Relationship Type */}
          <div>
            <label className="block text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">
              Relationship Type
            </label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Same person, Same family"
              className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/25"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {RELATIONSHIP_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setType(s)}
                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                    type === s
                      ? 'border-brand-gold/25 bg-brand-gold/10 text-brand-gold'
                      : 'border-brand-gold/[0.08] text-brand-muted hover:text-brand-cream hover:border-brand-gold/15'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional context about this relationship..."
              className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/25 resize-none"
            />
          </div>

          {/* Priority + toggles */}
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">
                Priority
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input
                type="checkbox"
                checked={bidirectional}
                onChange={(e) => setBidirectional(e.target.checked)}
                className="w-4 h-4 rounded bg-brand-card border-brand-gold/[0.15] text-brand-gold focus:ring-brand-gold/25"
              />
              <span className="text-sm text-brand-cream">Bidirectional</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="w-4 h-4 rounded bg-brand-card border-brand-gold/[0.15] text-brand-gold focus:ring-brand-gold/25"
              />
              <span className="text-sm text-brand-cream">Featured</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-brand-gold/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-brand-muted hover:text-brand-cream transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 bg-brand-gold/10 text-brand-gold rounded-xl text-sm font-medium hover:bg-brand-gold/20 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPicker({
  label,
  collections,
  selectedSlug,
  onSlugChange,
  search,
  onSearchChange,
  results,
  searching,
  selectedId,
  selectedName,
  onSelect,
  disabled,
}: {
  label: string;
  collections: Pick<Collection, 'slug' | 'name' | 'table_name'>[];
  selectedSlug: string;
  onSlugChange: (slug: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  results: RecordOption[];
  searching: boolean;
  selectedId: string;
  selectedName: string;
  onSelect: (r: RecordOption) => void;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-60 pointer-events-none' : ''}>
      <label className="block text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">
        {label}
      </label>

      {/* Collection dropdown */}
      <select
        value={selectedSlug}
        onChange={(e) => onSlugChange(e.target.value)}
        className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25 mb-2"
      >
        <option value="">Select collection...</option>
        {collections.map((c) => (
          <option key={c.slug} value={c.slug}>{c.name}</option>
        ))}
      </select>

      {/* Selected record display */}
      {selectedId ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-gold/5 border border-brand-gold/15 rounded-xl">
          <span className="text-sm text-brand-cream flex-1 truncate">
            {selectedName || selectedId}
          </span>
          {!disabled && (
            <button
              onClick={() => onSelect({ id: '', slug: '', name: '' })}
              className="text-brand-muted hover:text-brand-cream"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : selectedSlug ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search records..."
            className="w-full pl-10 pr-4 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream placeholder:text-brand-muted focus:outline-none focus:border-brand-gold/25"
          />
          {(results.length > 0 || searching) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-brand-bg border border-brand-gold/[0.12] rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
              {searching ? (
                <div className="px-3 py-2 text-xs text-brand-muted">Searching...</div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r)}
                    className="w-full text-left px-3 py-2 text-sm text-brand-cream hover:bg-brand-card transition-colors"
                  >
                    {r.name}
                    <span className="text-xs text-brand-muted ml-2">{r.id.slice(0, 8)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
