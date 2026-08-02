'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { AdminRecordEditModal } from '@/components/admin/admin-record-edit-modal';
import { AdminBulkEditModal } from '@/components/admin/admin-bulk-edit-modal';
import { AdminConfirmDeleteModal } from '@/components/admin/admin-confirm-delete-modal';
import type { Collection, CollectionRecord } from '@/lib/types';

interface AdminRecordsTableProps {
  collection: Collection;
  records: CollectionRecord[];
  totalCount: number;
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding']);

export function AdminRecordsTable({ collection, records, totalCount }: AdminRecordsTableProps) {
  const router = useRouter();

  const [editRecord, setEditRecord] = useState<CollectionRecord | null | 'new'>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headerCbRef = useRef<HTMLInputElement>(null);

  // Get all columns from the first record, excluding system fields for display
  const allCols = records.length > 0
    ? Object.keys(records[0]).filter((k) => !SYSTEM_FIELDS.has(k))
    : [];

  // Prioritize display_columns, then fill in rest
  const displayCols = collection.display_columns || [];
  const columns = displayCols.length > 0
    ? [...new Set([...displayCols, ...allCols.filter((c) => !displayCols.includes(c))])]
    : allCols;

  // Show first 5 columns in the table for quick identification
  const visibleCols = columns.slice(0, 5);

  // Selection state. `selectAll` means the whole collection (across pages);
  // otherwise `selectedIds` holds the explicitly checked rows.
  const visibleIds = records.map((r) => r.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const hasSelection = selectAll || selectedIds.size > 0;

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate =
        !selectAll && !allVisibleSelected && someVisibleSelected;
    }
  }, [selectAll, allVisibleSelected, someVisibleSelected]);

  const toggleRow = (id: string) => {
    if (selectAll) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectAll(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectAll(false);
    setSelectedIds(new Set());
  };

  const deleteRecord = async (recordId: string) => {
    if (!collection.table_name) return;
    if (!confirm('Delete this record? This cannot be undone.')) return;

    const res = await fetch('/api/admin/records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableName: collection.table_name, id: recordId }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error('Failed to delete record:', data.error);
    } else {
      router.refresh();
    }
  };

  const handleSaved = () => {
    setEditRecord(null);
    router.refresh();
  };

  const handleBulkSaved = () => {
    setBulkOpen(false);
    clearSelection();
    router.refresh();
  };

  const affectedCount = selectAll ? totalCount : selectedIds.size;

  const deleteSelected = async () => {
    if (!collection.table_name || affectedCount === 0) return;
    setDeleting(true);
    setDeleteError(null);

    const body: Record<string, unknown> = { tableName: collection.table_name };
    if (selectAll) {
      body.all = true;
      body.discriminatorColumn = collection.discriminator_column;
      body.discriminatorValue = collection.discriminator_value;
    } else {
      body.ids = [...selectedIds];
    }

    try {
      const res = await fetch('/api/admin/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Delete failed');
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setBulkDeleteOpen(false);
      clearSelection();
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Add Record button */}
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setEditRecord('new')}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Record
        </Button>
      </div>

      {/* Selection toolbar */}
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-brand-card border border-brand-gold/[0.15] rounded-xl px-4 py-3">
          <span className="text-sm text-brand-cream font-medium">
            {selectAll
              ? `All ${totalCount.toLocaleString()} records selected`
              : `${selectedIds.size.toLocaleString()} selected`}
          </span>
          {!selectAll && selectedIds.size < totalCount && (
            <button
              onClick={() => setSelectAll(true)}
              className="text-xs text-brand-gold hover:text-brand-gold-light underline underline-offset-2"
            >
              Select all {totalCount.toLocaleString()} in collection
            </button>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => setBulkOpen(true)}
            className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light"
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Bulk Edit
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setBulkDeleteOpen(true);
            }}
            className="bg-brand-burgundy text-white hover:bg-brand-burgundy/85"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className="text-brand-muted hover:text-brand-cream"
          >
            Clear
          </Button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-12 text-brand-muted text-sm bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
          No records found. Click &ldquo;Add Record&rdquo; to create one.
        </div>
      ) : (
        <div className="overflow-x-auto bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gold/[0.08]">
                <th className="w-10 py-3 px-4">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={selectAll || allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="w-4 h-4 rounded accent-brand-gold cursor-pointer align-middle"
                    aria-label="Select all rows on this page"
                  />
                </th>
                {visibleCols.map((col) => (
                  <th
                    key={col}
                    className="text-left py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted"
                  >
                    {snakeCaseToTitleCase(col)}
                  </th>
                ))}
                <th className="text-right py-3 px-4 text-xs font-semibold tracking-wide uppercase text-brand-muted w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const checked = selectAll || selectedIds.has(record.id);
                return (
                  <tr
                    key={record.id}
                    className={`border-b border-brand-gold/[0.04] hover:bg-brand-card-hover/50 transition-colors cursor-pointer ${
                      checked ? 'bg-brand-gold/[0.05]' : ''
                    }`}
                    onClick={() => setEditRecord(record)}
                  >
                    <td
                      className="py-2.5 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={selectAll}
                        onChange={() => toggleRow(record.id)}
                        className="w-4 h-4 rounded accent-brand-gold cursor-pointer align-middle disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Select record"
                      />
                    </td>
                    {visibleCols.map((col) => (
                      <td
                        key={col}
                        className="py-2.5 px-4 text-sm text-brand-cream max-w-[220px]"
                      >
                        <span className="truncate block">
                          {String(record[col] ?? '—')}
                        </span>
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditRecord(record)}
                          className="h-7 w-7 p-0 text-brand-muted hover:text-brand-gold"
                          title="Edit all fields"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRecord(record.id)}
                          className="h-7 w-7 p-0 text-brand-muted hover:text-brand-burgundy"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Add Modal */}
      {editRecord !== null && (
        <AdminRecordEditModal
          collection={collection}
          record={editRecord === 'new' ? null : editRecord}
          columns={columns}
          onClose={() => setEditRecord(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Bulk Edit Modal */}
      {bulkOpen && (
        <AdminBulkEditModal
          collection={collection}
          columns={columns}
          selectedIds={[...selectedIds]}
          selectAll={selectAll}
          totalCount={totalCount}
          onClose={() => setBulkOpen(false)}
          onSaved={handleBulkSaved}
        />
      )}

      {/* Bulk Delete confirmation */}
      {bulkDeleteOpen && (
        <AdminConfirmDeleteModal
          title="Delete records"
          confirmLabel={`Delete ${affectedCount.toLocaleString()} record${affectedCount === 1 ? '' : 's'}`}
          busy={deleting}
          error={deleteError}
          onConfirm={deleteSelected}
          onClose={() => setBulkDeleteOpen(false)}
        >
          This permanently deletes{' '}
          <span className="font-semibold text-brand-cream">
            {affectedCount.toLocaleString()}
          </span>{' '}
          record{affectedCount === 1 ? '' : 's'} from{' '}
          <span className="font-mono text-brand-burgundy-light">
            {collection.table_name}
          </span>
          . This cannot be undone.
        </AdminConfirmDeleteModal>
      )}
    </>
  );
}
