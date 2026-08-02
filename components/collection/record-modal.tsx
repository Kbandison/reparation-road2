'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, ArrowLeft, Loader2, ZoomIn, ExternalLink } from 'lucide-react';
import type { Collection, CollectionRecord } from '@/lib/types';
import { buildImageUrl, isPdfPath } from '@/lib/collections/helpers';
import { snakeCaseToTitleCase, formatFieldValue } from '@/lib/utils/format';
import { BookmarkButton } from '@/components/collection/bookmark-button';
import { ModalRelatedRecords } from '@/components/collection/modal-related-records';
import { RecordCitation } from '@/components/collection/record-citation';
import { ZoomableImage } from '@/components/collection/zoomable-image';

interface RecordModalProps {
  collection: Collection;
  record: CollectionRecord;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  // Full-screen paging: jump to the record whose image is the previous / next
  // distinct scan (skipping records that share the current page image).
  onPrevImage?: () => void;
  onNextImage?: () => void;
  hasPrevImage?: boolean;
  hasNextImage?: boolean;
}

const HIDDEN_FIELDS = new Set([
  'id', 'slug', 'created_at', 'updated_at', 'embedding', 'tsv', 'collection_tag',
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
  onPrevImage,
  onNextImage,
  hasPrevImage,
  hasNextImage,
}: RecordModalProps) {
  // Internal navigation override state
  const [overrideData, setOverrideData] = useState<{ collection: Collection; record: CollectionRecord } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);
  // Fall back to the raw object URL when Supabase's transform endpoint 400s on
  // an oversize scan (see image-viewer). The full-screen zoom view handles its
  // own fallback via ZoomableImage's fallbackSrc.
  const [imgFailed, setImgFailed] = useState(false);
  // Full-collection page scans, so full-screen can flip through EVERY image in
  // the collection, not just the records loaded on the current page.
  const [zoomImages, setZoomImages] = useState<string[] | null>(null);
  const [zoomImagesSlug, setZoomImagesSlug] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(-1);

  // Use override data when navigated, otherwise use props
  const activeCollection = overrideData?.collection ?? collection;
  const activeRecord = overrideData?.record ?? record;

  const imagePath = (activeRecord.image_path as string) || (activeRecord.image_url as string);
  const isPdf = isPdfPath(imagePath);
  // Archival scans are 20-35 MB raw — request width-capped transforms.
  // (For PDFs buildImageUrl returns the raw object URL, which we embed.)
  const imageUrl = buildImageUrl(imagePath, { width: 1400 });
  const imageZoomUrl = buildImageUrl(imagePath, { width: 2400 });
  const rawImageUrl = buildImageUrl(imagePath);
  const ocrText = activeRecord.ocr_text as string | undefined;
  const hasImage = activeCollection.has_images && !!imageUrl;

  // Reset the transform-failed flags when navigating to a different record.
  const [prevImagePath, setPrevImagePath] = useState(imagePath);
  if (prevImagePath !== imagePath) {
    setPrevImagePath(imagePath);
    setImgFailed(false);
  }

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

  // Full-screen paging. Prefer the full-collection scan list (spans every
  // page); fall back to the record-list props when it isn't loaded.
  const listReady =
    zoomImages !== null && zoomImagesSlug === activeCollection.slug && zoomIdx >= 0;

  const handlePrevImage = useCallback(() => {
    if (listReady && zoomIdx > 0) {
      setZoomIdx((i) => Math.max(0, i - 1));
      return;
    }
    setOverrideData(null);
    onPrevImage?.();
  }, [onPrevImage, listReady, zoomIdx]);

  const handleNextImage = useCallback(() => {
    if (listReady && zoomImages && zoomIdx < zoomImages.length - 1) {
      setZoomIdx((i) => i + 1);
      return;
    }
    setOverrideData(null);
    onNextImage?.();
  }, [onNextImage, listReady, zoomImages, zoomIdx]);

  const handleBack = useCallback(() => {
    setOverrideData(null);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close the full-screen zoom first if it's open, otherwise the modal.
        if (imageZoom) setImageZoom(false);
        else handleClose();
        return;
      }
      if (overrideData) return;
      if (imageZoom) {
        // In full-screen, the arrows page through distinct images/pages.
        if (e.key === 'ArrowLeft' && hasPrevImage) handlePrevImage();
        if (e.key === 'ArrowRight' && hasNextImage) handleNextImage();
      } else {
        if (e.key === 'ArrowLeft' && hasPrev && onPrev) handlePrev();
        if (e.key === 'ArrowRight' && hasNext && onNext) handleNext();
      }
    },
    [
      handleClose, handlePrev, handleNext, handlePrevImage, handleNextImage,
      overrideData, hasPrev, hasNext, onPrev, onNext, hasPrevImage, hasNextImage, imageZoom,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // When entering full-screen, load every page scan for the collection so the
  // viewer can flip through all of them. Position on the current record's page.
  useEffect(() => {
    if (!imageZoom || !activeCollection.slug) return;
    const slug = activeCollection.slug;
    if (zoomImages !== null && zoomImagesSlug === slug) {
      setZoomIdx(zoomImages.indexOf(imagePath));
      return;
    }
    let active = true;
    fetch(`/api/collection-search/images?collection=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((d) => {
        if (!active) return;
        const imgs: string[] = Array.isArray(d.images) ? d.images : [];
        setZoomImages(imgs);
        setZoomImagesSlug(slug);
        setZoomIdx(imgs.indexOf(imagePath));
      })
      .catch(() => {
        if (!active) return;
        setZoomImages([]);
        setZoomImagesSlug(slug);
        setZoomIdx(-1);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageZoom, activeCollection.slug]);

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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide">
                      Document {isPdf ? 'PDF' : 'Image'}
                    </p>
                    {isPdf && (
                      <a
                        href={imageUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-brand-gold hover:text-brand-gold-light"
                      >
                        <ExternalLink className="w-3 h-3" /> Open in new tab
                      </a>
                    )}
                  </div>
                  {isPdf ? (
                    <iframe
                      src={`${imageUrl!}#toolbar=0&view=FitH`}
                      title={String(title)}
                      className="w-full aspect-[3/4] rounded-xl bg-white border border-brand-gold/[0.08]"
                    />
                  ) : (
                    <button
                      onClick={() => setImageZoom(true)}
                      className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-black group cursor-zoom-in"
                    >
                      {imgFailed && rawImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rawImageUrl} alt={String(title)} className="absolute inset-0 w-full h-full object-contain" />
                      ) : (
                        <Image
                          src={imageUrl!}
                          alt={String(title)}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, 50vw"
                          onError={() => setImgFailed(true)}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                      </div>
                    </button>
                  )}
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
                          {formatFieldValue(val)}
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
          )}

        </div>

        {/* Related Records + Citation — sticky footer, full modal width */}
        <div className="flex-shrink-0">
          {activeCollection.table_name && (
            <ModalRelatedRecords
              recordId={activeRecord.id}
              tableName={activeCollection.table_name}
              collectionSlug={activeCollection.slug}
              onNavigate={handleNavigateToRecord}
            />
          )}
          <RecordCitation collection={activeCollection} record={activeRecord} />
        </div>
      </div>
    </div>
  );

  // Full-screen image: prefer the collection-wide scan list (spans all pages);
  // otherwise show the current record's image with record-list paging.
  const overlayPath =
    listReady && zoomImages && zoomIdx >= 0 && zoomIdx < zoomImages.length
      ? zoomImages[zoomIdx]
      : null;
  const listActive = overlayPath !== null;
  const overlaySrc = overlayPath
    ? buildImageUrl(overlayPath, { width: 2400 }) ?? buildImageUrl(overlayPath)
    : imageZoomUrl ?? imageUrl;
  const overlayFallback = overlayPath
    ? buildImageUrl(overlayPath) ?? undefined
    : rawImageUrl ?? undefined;
  const showPrevImage = listActive ? zoomIdx > 0 : !overrideData && !!hasPrevImage;
  const showNextImage = listActive
    ? zoomIdx < (zoomImages?.length ?? 0) - 1
    : !overrideData && !!hasNextImage;

  const zoomOverlay = imageZoom && imageUrl && !isPdf ? (
    <div className="fixed inset-0 z-[110] bg-black/90">
      <button
        onClick={() => setImageZoom(false)}
        aria-label="Close full-screen view"
        className="absolute top-4 right-4 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors z-20"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Page counter across the whole collection. */}
      {listActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/50 text-white text-xs font-medium tabular-nums">
          {zoomIdx + 1} / {zoomImages!.length}
        </div>
      )}

      {/* Page navigation — flips to the previous / next scan. */}
      {showPrevImage && (
        <button
          onClick={handlePrevImage}
          aria-label="Previous page"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {showNextImage && (
        <button
          onClick={handleNextImage}
          aria-label="Next page"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <ZoomableImage
        key={overlaySrc ?? ''}
        src={overlaySrc!}
        fallbackSrc={overlayFallback}
        alt={String(title)}
      />
    </div>
  ) : null;

  return createPortal(
    <>
      {modal}
      {zoomOverlay}
    </>,
    document.body
  );
}
