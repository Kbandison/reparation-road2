'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Collection, CollectionRecord } from '@/lib/types';
import { buildImageUrl, getRecordTitle } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { trackActivity } from '@/lib/hooks/use-activity';
import { RecordModal } from '@/components/collection/record-modal';

interface BookGridProps {
  collection: Collection;
  records: CollectionRecord[];
}

export function BookGrid({ collection, records }: BookGridProps) {
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {records.map((record, idx) => {
          const imagePath = (record.image_path as string) || (record.image_url as string);
          const imageUrl = buildImageUrl(imagePath);
          const label = columns
            .map((col) => record[col])
            .filter(Boolean)
            .join(' — ') || record.slug || record.id;

          return (
            <button
              key={record.id}
              onClick={() => selectRecord(idx)}
              className="group block text-left"
            >
              <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden hover:border-brand-gold/25 hover:-translate-y-1 transition-all duration-200">
                {/* Thumbnail */}
                <div className="aspect-[3/4] relative bg-brand-bg">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={String(label)}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-brand-muted text-xs">
                      No image
                    </div>
                  )}
                </div>

                {/* Record snapshot */}
                <div className="px-3 pt-2.5 pb-3 space-y-1">
                  {/* Title from first display column */}
                  {columns[0] && String(record[columns[0]] ?? '') && (
                    <p className="text-sm font-medium text-brand-cream truncate">
                      {String(record[columns[0]])}
                    </p>
                  )}
                  {/* Additional detail fields */}
                  {columns.slice(1, 5).map((col) => {
                    const val = record[col];
                    if (!val && val !== 0) return null;
                    return (
                      <p key={col} className="text-xs text-brand-muted truncate">
                        <span className="text-brand-muted/70">{snakeCaseToTitleCase(col)}:</span>{' '}
                        <span className="text-brand-cream/70">{String(val)}</span>
                      </p>
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
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
