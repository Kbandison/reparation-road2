'use client';

import { useEffect, useCallback } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Collection, CollectionRecord } from '@/lib/types';
import { buildImageUrl } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { BookmarkButton } from '@/components/collection/bookmark-button';

interface RecordModalProps {
  collection: Collection;
  record: CollectionRecord;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const HIDDEN_FIELDS = new Set([
  'id', 'slug', 'created_at', 'updated_at', 'embedding',
  'image_path', 'image_url', 'ocr_text',
  'county', 'vessel_name', 'state',
]);

export function RecordModal({
  collection,
  record,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: RecordModalProps) {
  const imagePath = (record.image_path as string) || (record.image_url as string);
  const imageUrl = buildImageUrl(imagePath);
  const ocrText = record.ocr_text as string | undefined;

  // Get display title from first display column
  const titleCol = collection.display_columns?.[0];
  const title = titleCol ? String(record[titleCol] ?? record.id) : record.id;

  // Get all visible fields
  const fields = Object.entries(record).filter(
    ([key, val]) => !HIDDEN_FIELDS.has(key) && val !== null && val !== undefined && val !== ''
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext();
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-brand-gold/[0.08] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {hasPrev && (
              <button
                onClick={onPrev}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-display text-lg font-semibold text-brand-cream truncate">
              {title}
            </h2>
            {hasNext && (
              <button
                onClick={onNext}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <BookmarkButton
              collectionSlug={collection.slug}
              recordId={record.slug || record.id}
              recordTitle={String(title)}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Image */}
          {collection.has_images && imageUrl && (
            <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-brand-card">
              <Image
                src={imageUrl}
                alt={String(title)}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 700px"
              />
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {fields.map(([key, val]) => (
              <div key={key} className="py-2 border-b border-brand-gold/[0.04]">
                <p className="text-xs text-brand-muted font-medium uppercase tracking-wide mb-0.5">
                  {snakeCaseToTitleCase(key)}
                </p>
                <p className="text-sm text-brand-cream break-words">
                  {String(val)}
                </p>
              </div>
            ))}
          </div>

          {/* OCR Text */}
          {collection.has_ocr && ocrText && (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4">
              <p className="text-xs text-brand-muted font-medium uppercase tracking-wide mb-2">
                OCR Transcription
              </p>
              <p className="text-sm text-brand-cream/80 leading-relaxed whitespace-pre-wrap font-mono">
                {ocrText}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
