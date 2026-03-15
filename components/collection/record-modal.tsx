'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import type { Collection, CollectionRecord } from '@/lib/types';
import { buildImageUrl } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { BookmarkButton } from '@/components/collection/bookmark-button';
import { ModalRelatedRecords } from '@/components/collection/modal-related-records';
import { RecordCitation } from '@/components/collection/record-citation';

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
  // Internal navigation override state
  const [overrideData, setOverrideData] = useState<{ collection: Collection; record: CollectionRecord } | null>(null);
  const [navigating, setNavigating] = useState(false);

  // Use override data when navigated, otherwise use props
  const activeCollection = overrideData?.collection ?? collection;
  const activeRecord = overrideData?.record ?? record;

  const imagePath = (activeRecord.image_path as string) || (activeRecord.image_url as string);
  const imageUrl = buildImageUrl(imagePath);
  const ocrText = activeRecord.ocr_text as string | undefined;
  const hasImage = activeCollection.has_images && !!imageUrl;

  const titleCol = activeCollection.display_columns?.[0];
  const title = titleCol ? String(activeRecord[titleCol] ?? activeRecord.id) : activeRecord.id;

  const fields = Object.entries(activeRecord).filter(
    ([key, val]) => !HIDDEN_FIELDS.has(key) && val !== null && val !== undefined && val !== ''
  );

  // Navigate to a related record within the modal
  const handleNavigateToRecord = useCallback(async (slug: string, recordId: string) => {
    setNavigating(true);
    try {
      const res = await fetch(
        `/api/collection-search/record?collection=${encodeURIComponent(slug)}&id=${encodeURIComponent(recordId)}`
      );
      if (!res.ok) throw new Error('Failed to fetch record');
      const data = await res.json();
      setOverrideData({ collection: data.collection, record: data.record });
    } catch {
      // Stay on current record if navigation fails
    } finally {
      setNavigating(false);
    }
  }, []);

  // Clear override on close
  const handleClose = useCallback(() => {
    setOverrideData(null);
    onClose();
  }, [onClose]);

  // Clear override on prev/next (return to list-based navigation)
  const handlePrev = useCallback(() => {
    setOverrideData(null);
    onPrev?.();
  }, [onPrev]);

  const handleNext = useCallback(() => {
    setOverrideData(null);
    onNext?.();
  }, [onNext]);

  const handleBack = useCallback(() => {
    setOverrideData(null);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (!overrideData) {
        if (e.key === 'ArrowLeft' && hasPrev && onPrev) handlePrev();
        if (e.key === 'ArrowRight' && hasNext && onNext) handleNext();
      }
    },
    [handleClose, handlePrev, handleNext, overrideData, hasPrev, hasNext, onPrev, onNext]
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
        onClick={handleClose}
      />

      {/* Modal */}
      <div className={`relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col ${hasImage ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {/* Loading overlay during navigation */}
        {navigating && (
          <div className="absolute inset-0 z-10 bg-brand-bg/80 rounded-2xl flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-brand-gold/[0.08] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {overrideData ? (
              <button
                onClick={handleBack}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs">Back</span>
              </button>
            ) : (
              hasPrev && (
                <button
                  onClick={handlePrev}
                  className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )
            )}
            <h2 className="font-display text-lg font-semibold text-brand-cream truncate">
              {title}
            </h2>
            {!overrideData && hasNext && (
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <BookmarkButton
              collectionSlug={activeCollection.slug}
              recordId={activeRecord.slug || activeRecord.id}
              recordTitle={String(title)}
            />
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {hasImage ? (
            <div className="flex flex-col md:flex-row min-h-0">
              {/* Left: Document Image */}
              <div className="md:w-1/2 flex-shrink-0 bg-brand-card/50 border-b md:border-b-0 md:border-r border-brand-gold/[0.06]">
                <div className="p-4">
                  <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide mb-2">
                    Document Image
                  </p>
                  <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black">
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

              {/* Right: Record Information + Related */}
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
                  {activeCollection.has_ocr && ocrText && (
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

                {/* Related Records */}
                {activeCollection.table_name && (
                  <ModalRelatedRecords
                    recordId={activeRecord.id}
                    tableName={activeCollection.table_name}
                    collectionSlug={activeCollection.slug}
                    onNavigate={handleNavigateToRecord}
                  />
                )}

                {/* Citation */}
                <RecordCitation collection={activeCollection} record={activeRecord} />
              </div>
            </div>
          ) : (
            /* No image — single-panel card layout */
            <>
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
                {activeCollection.has_ocr && ocrText && (
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

              {/* Related Records */}
              {activeCollection.table_name && (
                <ModalRelatedRecords
                  recordId={activeRecord.id}
                  tableName={activeCollection.table_name}
                  collectionSlug={activeCollection.slug}
                  onNavigate={handleNavigateToRecord}
                />
              )}

              {/* Citation */}
              <RecordCitation collection={activeCollection} record={activeRecord} />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
