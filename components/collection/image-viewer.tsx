'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { buildImageUrl, isPdfPath } from '@/lib/collections/helpers';

interface ImageViewerProps {
  imagePath: string;
  alt: string;
}

export function ImageViewer({ imagePath, alt }: ImageViewerProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isPdf = isPdfPath(imagePath);
  // Archival scans are 20-35 MB raw — request width-capped transforms.
  // (For PDFs buildImageUrl returns the raw object URL, which we embed.)
  const thumbUrl = buildImageUrl(imagePath, { width: 1400 });
  const fullUrl = buildImageUrl(imagePath, { width: 2400 });

  if (!thumbUrl) return null;

  // PDFs render in the browser's native viewer via an <iframe>; no lightbox.
  if (isPdf) {
    return (
      <div className="space-y-2">
        <iframe
          src={`${thumbUrl}#view=FitH`}
          title={alt}
          className="w-full h-[70vh] rounded-2xl bg-white border border-brand-gold/[0.08]"
        />
        <a
          href={thumbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-brand-gold hover:text-brand-gold-light"
        >
          <ExternalLink className="w-4 h-4" /> Open PDF in new tab
        </a>
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
        <Image
          src={thumbUrl}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
          priority
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] bg-brand-bg border-brand-gold/[0.08] p-2">
          <div
            className="relative w-full h-[80vh] overflow-auto cursor-zoom-in"
            onClick={() => setZoom(zoom === 1 ? 2 : 1)}
          >
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.3s' }}>
              <Image
                src={fullUrl ?? thumbUrl}
                alt={alt}
                width={1600}
                height={1200}
                className="object-contain w-full h-auto"
                sizes="90vw"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
