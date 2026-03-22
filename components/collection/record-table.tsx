'use client';

import { useState } from 'react';
import type { Collection, CollectionRecord } from '@/lib/types';
import { snakeCaseToTitleCase, formatFieldValue } from '@/lib/utils/format';
import { trackActivity } from '@/lib/hooks/use-activity';
import { getRecordTitle } from '@/lib/collections/helpers';
import { RecordModal } from '@/components/collection/record-modal';

interface RecordTableProps {
  collection: Collection;
  records: CollectionRecord[];
}

export function RecordTable({ collection, records }: RecordTableProps) {
  const columns = collection.display_columns || [];
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selectedRecord = selectedIdx !== null ? records[selectedIdx] : null;

  function selectRecord(idx: number) {
    setSelectedIdx(idx);
    const record = records[idx];
    trackActivity({
      type: 'record',
      slug: record.slug || record.id,
      name: getRecordTitle(record, columns),
      collectionSlug: collection.slug,
      collectionName: collection.name,
    });
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-gold/[0.08]">
                <th className="text-left py-3 px-4 text-[11px] font-semibold tracking-wider uppercase text-brand-muted w-8">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left py-3 px-4 text-[11px] font-semibold tracking-wider uppercase text-brand-muted"
                  >
                    {snakeCaseToTitleCase(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, idx) => (
                <tr
                  key={record.id}
                  onClick={() => selectRecord(idx)}
                  className={`border-b border-brand-gold/[0.03] hover:bg-brand-gold/[0.04] transition-colors cursor-pointer ${
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-brand-bg/30'
                  }`}
                >
                  <td className="py-3 px-4 text-xs text-brand-muted tabular-nums">
                    {idx + 1}
                  </td>
                  {columns.map((col, i) => (
                    <td key={col} className={`py-3 px-4 text-sm ${i === 0 ? 'font-medium' : ''}`}>
                      {i === 0 ? (
                        <span className="text-brand-gold hover:text-brand-gold-light">
                          {formatFieldValue(record[col]) || '—'}
                        </span>
                      ) : (
                        <span className="text-brand-cream/80">
                          {formatFieldValue(record[col]) || '—'}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {records.map((record, idx) => (
          <button
            key={record.id}
            onClick={() => selectRecord(idx)}
            className="block w-full text-left bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 hover:border-brand-gold/25 transition-colors"
          >
            {columns.slice(0, 4).map((col, i) => (
              <div key={col} className={i === 0 ? 'mb-2' : 'mb-1'}>
                {i === 0 ? (
                  <p className="text-sm font-medium text-brand-gold">{formatFieldValue(record[col]) || '—'}</p>
                ) : (
                  <p className="text-xs text-brand-muted">
                    <span className="text-brand-cream-muted">{snakeCaseToTitleCase(col)}:</span>{' '}
                    {formatFieldValue(record[col]) || '—'}
                  </p>
                )}
              </div>
            ))}
          </button>
        ))}
      </div>

      {/* Record Detail Modal */}
      {selectedRecord && (
        <RecordModal
          collection={collection}
          record={selectedRecord}
          onClose={() => setSelectedIdx(null)}
          onPrev={selectedIdx! > 0 ? () => setSelectedIdx(selectedIdx! - 1) : undefined}
          onNext={selectedIdx! < records.length - 1 ? () => setSelectedIdx(selectedIdx! + 1) : undefined}
          hasPrev={selectedIdx! > 0}
          hasNext={selectedIdx! < records.length - 1}
        />
      )}
    </>
  );
}
