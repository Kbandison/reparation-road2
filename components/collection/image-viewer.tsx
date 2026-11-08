'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/collection/zoomable-image';
import { SourceImageLink, SourceLink } from '@/components/collection/source-image-link';
import { PendingScan } from '@/components/collection/pending-scan';
import { buildImageUrl, isPdfPath } from '@/lib/collections/helpers';

interface ImageViewerProps {
  imagePath: string;
  alt: string;
  /** A blurred scan's link to the original at its source: the image opens it instead of zooming. */
  sourceLink?: string | null;
  /** The collection is blurred but this scan isn't yet: show nothing of it. */
  pending?: boolean;
}

export function ImageViewer({ imagePath, alt, sourceLink = null, pending = false }: ImageViewerProps) {
  const [open, setOpen] = useState(false);
  // Some archival scans are too large for Supabase's image transform endpoint
  // (it returns 400). When the transformed src fails to load we fall back to the
  // raw object URL so the image still shows instead of breaking.
  const [thumbFailed, setThumbFailed] = useState(false);

  const isPdf = isPdfPath(imagePath);
  // Archival scans are 20-35 MB raw — request width-capped transforms.
  // (For PDFs buildImageUrl returns the raw object URL, which we embed.)
  const thumbUrl = buildImageUrl(imagePath, { width: 1400 });
  const fullUrl = buildImageUrl(imagePath, { width: 2400 });
  const rawUrl = buildImageUrl(imagePath); // un-transformed object URL

  if (!thumbUrl) return null;

  if (pending) {
    return <PendingScan className="w-full aspect-[4/3] rounded-2xl border border-brand-gold/[0.08]" />;
  }

  const sourceAnchor = sourceLink && (
    <SourceLink
      href={sourceLink}
      className="inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
    >
      <ExternalLink className="w-4 h-4" /> View the original image
    </SourceLink>
  );

  // PDFs render in the browser's native viewer via an <iframe>; no lightbox.
  if (isPdf) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <iframe
            src={`${thumbUrl}#view=FitH`}
            title={alt}
            className="w-full h-[70vh] rounded-2xl bg-white border border-brand-gold/[0.08]"
          />
          {sourceLink && <SourceImageLink href={sourceLink} className="rounded-2xl" />}
        </div>
        {sourceAnchor || (
          <a
            href={thumbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
          >
            <ExternalLink className="w-4 h-4" /> Open PDF in new tab
          </a>
        )}
      </div>
    );
  }

  const image = thumbFailed && rawUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={rawUrl} alt={alt} className="absolute inset-0 w-full h-full object-contain" />
  ) : (
    <Image
      src={thumbUrl}
      alt={alt}
      fill
      className="object-contain"
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
      priority
      onError={() => setThumbFailed(true)}
    />
  );

  // A blurred scan with a source link opens the original there, not the zoom.
  if (sourceLink) {
    return (
      <div className="space-y-2">
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-brand-card border border-brand-gold/[0.08]">
          {image}
          <SourceImageLink href={sourceLink} className="rounded-2xl" />
        </div>
        {sourceAnchor}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-brand-card border border-brand-gold/[0.08] cursor-zoom-in hover:border-brand-gold/25 transition-colors"
        onClick={() => setOpen(true)}
        aria-label={`View full size image: ${alt}`}
      >
        {image}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] max-h-[93vh] bg-brand-bg border-brand-gold/[0.08] p-0 overflow-hidden">
          <div className="relative w-full h-[85vh]">
            <ZoomableImage src={fullUrl ?? thumbUrl} fallbackSrc={rawUrl ?? undefined} alt={alt} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
