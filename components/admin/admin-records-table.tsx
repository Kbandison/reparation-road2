'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { AdminRecordEditModal } from '@/components/admin/admin-record-edit-modal';
import type { Collection, CollectionRecord } from '@/lib/types';

interface AdminRecordsTableProps {
  collection: Collection;
  records: CollectionRecord[];
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'created_at', 'updated_at', 'embedding']);

export function AdminRecordsTable({ collection, records }: AdminRecordsTableProps) {
  const router = useRouter();
  const supabase = createClient();

  const [editRecord, setEditRecord] = useState<CollectionRecord | null | 'new'>(null);

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

      {records.length === 0 ? (
        <div className="text-center py-12 text-brand-muted text-sm bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
          No records found. Click &ldquo;Add Record&rdquo; to create one.
        </div>
      ) : (
        <div className="overflow-x-auto bg-brand-card border border-brand-gold/[0.08] rounded-2xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gold/[0.08]">
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
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-brand-gold/[0.04] hover:bg-brand-card-hover/50 transition-colors cursor-pointer"
                  onClick={() => setEditRecord(record)}
                >
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
              ))}
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
    </>
  );
}
