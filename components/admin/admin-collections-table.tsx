'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { snakeCaseToTitleCase, formatNumber } from '@/lib/utils/format';
import type { Collection } from '@/lib/types';
import { AdminCollectionEditModal } from './admin-collection-edit-modal';
import { AdminConfirmDeleteModal } from './admin-confirm-delete-modal';

interface AdminCollectionsTableProps {
  collections: Collection[];
}

export function AdminCollectionsTable({ collections }: AdminCollectionsTableProps) {
  const router = useRouter();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Single-collection delete (per-row trash).
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [deleteRecordsToo, setDeleteRecordsToo] = useState(false);
  const [deletingOne, setDeletingOne] = useState(false);
  const [deleteOneError, setDeleteOneError] = useState<string | null>(null);
  const headerCbRef = useRef<HTMLInputElement>(null);

  // Tables used by more than one collection — deleting all rows of a shared
  // table (with no discriminator to scope it) would wipe the siblings too.
  const tableCounts = new Map<string, number>();
  collections.forEach((c) => {
    if (c.table_name) tableCounts.set(c.table_name, (tableCounts.get(c.table_name) || 0) + 1);
  });
  const isSharedTable = (t: string | null) => !!t && (tableCounts.get(t) || 0) > 1;

  const allIds = collections.map((c) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  // A collection's own id plus every descendant's id. Selecting a folder
  // selects its whole subtree so deleting it doesn't strand children (which the
  // API's orphan guard would otherwise refuse).
  const collectSubtreeIds = (col: Collection): string[] => {
    const ids = [col.id];
    for (const child of childrenMap.get(col.slug) || []) {
      ids.push(...collectSubtreeIds(child));
    }
    return ids;
  };

  const toggleRow = (col: Collection) => {
    const ids = collectSubtreeIds(col);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedNames = collections
    .filter((c) => selectedIds.has(c.id))
    .map((c) => c.name);

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/admin/collections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || 'Delete failed');
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setDeleteOpen(false);
      clearSelection();
      toast.success(`Deleted ${data.deleted} collection${data.deleted === 1 ? '' : 's'}`);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const runSingleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeletingOne(true);
    setDeleteOneError(null);
    try {
      const soleOwner = !!target.table_name && !isSharedTable(target.table_name);

      // Shared table with a discriminator: drop just this collection's rows —
      // the table itself has to stay for the other collections that use it.
      if (deleteRecordsToo && target.table_name && !soleOwner) {
        const rres = await fetch('/api/admin/records', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName: target.table_name,
            all: true,
            discriminatorColumn: target.discriminator_column,
            discriminatorValue: target.discriminator_value,
          }),
        });
        if (!rres.ok) {
          const d = await rres.json().catch(() => ({}));
          setDeleteOneError(d.error || 'Failed to delete records');
          setDeletingOne(false);
          return;
        }
      }

      // Delete the collection entry (plus its child entries if it's a folder).
      // When the user opted in and this collection solely owns its table, drop
      // the whole table (server re-checks it's unreferenced before dropping).
      const ids = collectSubtreeIds(target);
      const dropTables =
        deleteRecordsToo && soleOwner && target.table_name ? [target.table_name] : [];
      const cres = await fetch('/api/admin/collections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, dropTables }),
      });
      const d = await cres.json().catch(() => ({}));
      if (!cres.ok) {
        setDeleteOneError(d.error || 'Delete failed');
        setDeletingOne(false);
        return;
      }
      setDeletingOne(false);
      setDeleteTarget(null);
      setDeleteRecordsToo(false);
      const dropped = Array.isArray(d.droppedTables) ? d.droppedTables : [];
      const kept = Array.isArray(d.keptTables) ? d.keptTables : [];
      toast.success(
        dropped.length
          ? `Deleted ${target.name} · dropped table ${dropped.join(', ')}`
          : `Deleted ${target.name}`
      );
      if (kept.length) {
        toast.error(`Kept table ${kept.join(', ')} — still referenced by another collection.`);
      }
      router.refresh();
    } catch (err) {
      setDeleteOneError(err instanceof Error ? err.message : 'Delete failed');
      setDeletingOne(false);
    }
  };

  async function patchCollection(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Update failed');
      return false;
    }
    return true;
  }

  async function syncCounts() {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync-counts', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.synced} of ${data.total} collections`);
        router.refresh();
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    }
    setSyncing(false);
  }

  // Separate parents and standalone from children
  const parents = collections.filter((c) => !c.table_name && !c.parent_slug);
  const standalone = collections.filter((c) => c.table_name && !c.parent_slug);
  const childrenMap = new Map<string, Collection[]>();
  collections.forEach((c) => {
    if (c.parent_slug) {
      const arr = childrenMap.get(c.parent_slug) || [];
      arr.push(c);
      childrenMap.set(c.parent_slug, arr);
    }
  });

  const toggleExpand = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleRowClick = (col: Collection) => {
    if (col.table_name) {
      router.push(`/admin/collections/${col.slug}`);
    } else {
      toggleExpand(col.slug);
    }
  };

  const togglePublished = async (col: Collection) => {
    const ok = await patchCollection(col.id, { is_published: !col.is_published });
    if (ok) router.refresh();
  };

  const cycleAccessTier = async (col: Collection) => {
    const tiers: Array<'free' | 'explorer' | 'scholar'> = ['free', 'explorer', 'scholar'];
    const currentIdx = tiers.indexOf(col.access_tier);
    const nextTier = tiers[(currentIdx + 1) % tiers.length];
    const ok = await patchCollection(col.id, { access_tier: nextTier });
    if (ok) router.refresh();
  };

  const renderRow = (col: Collection, depth: number = 0) => {
    const children = childrenMap.get(col.slug);
    const isExpanded = expanded.has(col.slug);
    const hasChildren = !!(children && children.length > 0);
    // Anything with children acts like a folder (regardless of whether it has its own table).
    const isFolder = hasChildren || !col.table_name;

    return (
      <tr
        key={col.id}
        onClick={() => handleRowClick(col)}
        className={`border-b border-brand-gold/[0.04] hover:bg-brand-card-hover/50 transition-colors cursor-pointer ${
          selectedIds.has(col.id) ? 'bg-brand-gold/[0.05]' : ''
        }`}
      >
        {/* Select */}
        <td className="py-3 px-4 w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(col.id)}
            onChange={() => toggleRow(col)}
            className="w-4 h-4 rounded accent-brand-gold cursor-pointer align-middle"
            aria-label={`Select ${col.name}`}
          />
        </td>

        {/* Name */}
        <td className="py-3 px-4 text-sm text-brand-cream font-medium">
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: depth * 24 }}
          >
            {hasChildren ? (
              <span className="p-0.5">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-brand-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-brand-muted" />
                )}
              </span>
            ) : (
              <span className="w-5" />
            )}
            {isFolder ? (
              <FolderOpen className="w-4 h-4 text-brand-gold flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-brand-muted flex-shrink-0" />
            )}
            <span className="truncate max-w-[300px]">{col.name}</span>
          </div>
        </td>

        {/* Category */}
        <td className="py-3 px-4 text-sm text-brand-muted">
          {snakeCaseToTitleCase(col.category)}
        </td>

        {/* Records */}
        <td className="py-3 px-4 text-sm text-brand-cream">
          {formatNumber(col.record_count)}
        </td>

        {/* Published */}
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => togglePublished(col)}>
            <span
              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                col.is_published
                  ? 'bg-brand-sage/10 text-brand-sage hover:bg-brand-sage/20'
                  : 'bg-brand-muted/10 text-brand-muted hover:bg-brand-muted/20'
              }`}
            >
              {col.is_published ? 'Published' : 'Draft'}
            </span>
          </button>
        </td>

        {/* Access */}
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => cycleAccessTier(col)}>
            <span
              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors capitalize ${
                col.access_tier === 'free'
                  ? 'bg-brand-sage/10 text-brand-sage hover:bg-brand-sage/20'
                  : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20'
              }`}
            >
              {col.access_tier}
            </span>
          </button>
        </td>

        {/* Display Type */}
        <td className="py-3 px-4 text-xs text-brand-muted capitalize">
          {col.display_type}
        </td>

        {/* Actions */}
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(col)}
              aria-label={`Edit ${col.name}`}
              className="p-1.5 rounded-lg text-brand-muted hover:text-brand-gold hover:bg-brand-card-hover/50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setDeleteRecordsToo(false);
                setDeleteOneError(null);
                setDeleteTarget(col);
              }}
              aria-label={`Delete ${col.name}`}
              className="p-1.5 rounded-lg text-brand-muted hover:text-brand-burgundy hover:bg-brand-card-hover/50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
    <div className="mb-4 flex items-center gap-3">
      {someSelected && (
        <>
          <span className="text-sm text-brand-cream font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-burgundy/90 text-white rounded-xl text-sm font-medium hover:bg-brand-burgundy transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-2 text-sm text-brand-muted hover:text-brand-cream transition-colors"
          >
            Clear
          </button>
        </>
      )}
      <div className="flex-1" />
      <button
        onClick={syncCounts}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-brand-gold/10 text-brand-gold rounded-xl text-sm font-medium hover:bg-brand-gold/20 transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Record Counts'}
      </button>
    </div>
    <div className="overflow-x-auto bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
      <table className="w-full">
        <thead>
          <tr className="border-b border-brand-gold/[0.08]">
            <th className="w-10 py-3 px-4">
              <input
                ref={headerCbRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 rounded accent-brand-gold cursor-pointer align-middle"
                aria-label="Select all collections"
              />
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Name
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Category
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Records
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Published
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Access
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted">
              Type
            </th>
            <th className="py-3 px-4">
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const renderTree = (col: Collection, depth: number): ReactNode[] => {
              const rows: ReactNode[] = [renderRow(col, depth)];
              if (expanded.has(col.slug)) {
                const children = childrenMap.get(col.slug) || [];
                for (const child of children) {
                  rows.push(...renderTree(child, depth + 1));
                }
              }
              return rows;
            };
            return [
              ...parents.flatMap((p) => renderTree(p, 0)),
              ...standalone.flatMap((c) => renderTree(c, 0)),
            ];
          })()}
        </tbody>
      </table>
    </div>

    {editing && (
      <AdminCollectionEditModal
        collection={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    )}

    {deleteOpen && (
      <AdminConfirmDeleteModal
        title="Delete collections"
        confirmLabel={`Delete ${selectedIds.size} collection${selectedIds.size === 1 ? '' : 's'}`}
        busy={deleting}
        error={deleteError}
        onConfirm={deleteSelected}
        onClose={() => setDeleteOpen(false)}
      >
        This removes{' '}
        <span className="font-semibold text-brand-cream">
          {selectedIds.size} collection {selectedIds.size === 1 ? 'entry' : 'entries'}
        </span>{' '}
        from the browse tree. The underlying data tables and their records are{' '}
        <span className="font-semibold text-brand-cream">not</span> deleted.
        {selectedNames.length <= 6 && (
          <span className="block mt-2 text-brand-muted">
            {selectedNames.join(', ')}
          </span>
        )}
      </AdminConfirmDeleteModal>
    )}

    {deleteTarget && (() => {
      const table = deleteTarget.table_name;
      const childCount = collectSubtreeIds(deleteTarget).length - 1;
      const recordCount = deleteTarget.record_count;
      const soleOwner = !!table && !isSharedTable(table);
      const shared = !!table && isSharedTable(table);
      const canDeleteRows = shared && !!deleteTarget.discriminator_value && recordCount > 0;
      const confirmLabel = deleteRecordsToo
        ? soleOwner
          ? 'Delete collection + table'
          : `Delete collection + ${recordCount.toLocaleString()} records`
        : 'Delete collection';
      return (
        <AdminConfirmDeleteModal
          title="Delete collection"
          confirmLabel={confirmLabel}
          busy={deletingOne}
          error={deleteOneError}
          onConfirm={runSingleDelete}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteRecordsToo(false);
          }}
        >
          Delete{' '}
          <span className="font-semibold text-brand-cream">{deleteTarget.name}</span>
          {childCount > 0 && (
            <>
              {' '}and its{' '}
              <span className="font-semibold text-brand-cream">
                {childCount} child collection{childCount === 1 ? '' : 's'}
              </span>
            </>
          )}
          .
          {/* Sole owner of its table → offer to drop the whole table. */}
          {soleOwner && (
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteRecordsToo}
                onChange={(e) => setDeleteRecordsToo(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-brand-burgundy cursor-pointer"
              />
              <span className="text-brand-cream-muted">
                Also delete the data table{' '}
                <span className="font-mono text-brand-burgundy-light">{table}</span>
                {recordCount > 0 && (
                  <>
                    {' '}and its{' '}
                    <span className="font-semibold text-brand-cream">
                      {recordCount.toLocaleString()} records
                    </span>
                  </>
                )}
                . This cannot be undone.
              </span>
            </label>
          )}

          {/* Shared table with a discriminator → can delete just this
              collection's rows, but the shared table itself stays. */}
          {canDeleteRows && (
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteRecordsToo}
                onChange={(e) => setDeleteRecordsToo(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-brand-burgundy cursor-pointer"
              />
              <span className="text-brand-cream-muted">
                Also permanently delete this collection&rsquo;s{' '}
                <span className="font-semibold text-brand-cream">
                  {recordCount.toLocaleString()} records
                </span>
                . The shared table{' '}
                <span className="font-mono text-brand-burgundy-light">{table}</span>{' '}
                is kept for other collections.
              </span>
            </label>
          )}

          {/* Shared, no discriminator → can't scope; keep the data. */}
          {shared && !deleteTarget.discriminator_value && (
            <span className="block mt-3 text-brand-muted">
              This collection shares its data table with others and can&rsquo;t be
              scoped, so its records and table are kept.
            </span>
          )}

          {!table && (
            <span className="block mt-3 text-brand-muted">
              Removes the collection entry only &mdash; no data table is attached.
            </span>
          )}
        </AdminConfirmDeleteModal>
      );
    })()}
    </>
  );
}
