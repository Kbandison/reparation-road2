'use client';

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const hasImage = collection.has_images && !!imageUrl;

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

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col ${hasImage ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-brand-gold/[0.08] flex-shrink-0">
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

        {/* Body — two-panel when image exists, single panel otherwise */}
        <div className="overflow-y-auto flex-1">
          {hasImage ? (
            <div className="flex flex-col md:flex-row min-h-0">
              {/* Left: Document Image */}
              <div className="md:w-1/2 flex-shrink-0 bg-brand-card/50 border-b md:border-b-0 md:border-r border-brand-gold/[0.06]">
                <div className="p-4">
                  <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-2">
                    Document Image
                  </p>
                  <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black/20">
                    <Image
                      src={imageUrl!}
                      alt={String(title)}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  </div>
                </div>
              </div>

              {/* Right: Record Information */}
              <div className="md:w-1/2 flex-1 overflow-y-auto">
                <div className="p-5">
                  <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-4">
                    Record Information
                  </p>
                  <div className="space-y-0">
                    {fields.map(([key, val]) => (
                      <div key={key} className="py-2.5 border-b border-brand-gold/[0.04] last:border-b-0">
                        <p className="text-[11px] text-brand-muted font-medium mb-0.5">
                          {snakeCaseToTitleCase(key)}
                        </p>
                        <p className="text-sm text-brand-cream break-words leading-relaxed">
                          {String(val)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* OCR Text */}
                  {collection.has_ocr && ocrText && (
                    <div className="mt-4 bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4">
                      <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-2">
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
          ) : (
            /* No image — single-panel card layout */
            <div className="p-5">
              <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-4">
                Record Information
              </p>
              <div className="space-y-0">
                {fields.map(([key, val]) => (
                  <div key={key} className="py-2.5 border-b border-brand-gold/[0.04] last:border-b-0">
                    <p className="text-[11px] text-brand-muted font-medium mb-0.5">
                      {snakeCaseToTitleCase(key)}
                    </p>
                    <p className="text-sm text-brand-cream break-words leading-relaxed">
                      {String(val)}
                    </p>
                  </div>
                ))}
              </div>

              {/* OCR Text */}
              {collection.has_ocr && ocrText && (
                <div className="mt-4 bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4">
                  <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-2">
                    OCR Transcription
                  </p>
                  <p className="text-sm text-brand-cream/80 leading-relaxed whitespace-pre-wrap font-mono">
                    {ocrText}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
