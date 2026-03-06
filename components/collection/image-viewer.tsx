'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { buildImageUrl } from '@/lib/collections/helpers';

interface ImageViewerProps {
  imagePath: string;
  alt: string;
}

export function ImageViewer({ imagePath, alt }: ImageViewerProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const imageUrl = buildImageUrl(imagePath);

  if (!imageUrl) return null;

  return (
    <>
      <div
        className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-card border border-brand-gold/[0.08] cursor-pointer hover:border-brand-gold/25 transition-colors"
        onClick={() => setOpen(true)}
      >
        <Image
          src={imageUrl}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
          priority
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] bg-brand-bg border-brand-gold/[0.08] p-2">
          <div
            className="relative w-full h-[80vh] overflow-auto cursor-zoom-in"
            onClick={() => setZoom(zoom === 1 ? 2 : 1)}
          >
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.3s' }}>
              <Image
                src={imageUrl}
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
