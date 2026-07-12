'use client';

import { useRef, useState } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Props {
  src: string;
  alt: string;
  // Shown if `src` fails to load (e.g. an oversize scan the transform can't do).
  fallbackSrc?: string;
}

// A pan + zoom image viewer for the full-screen record image: scroll/pinch to
// zoom, drag to pan, double-click to zoom in, and on-screen controls. The image
// re-centers once it loads so its true dimensions are used.
export function ZoomableImage({ src, alt, fallbackSrc }: Props) {
  const ref = useRef<ReactZoomPanPinchRef>(null);
  const [failed, setFailed] = useState(false);
  const shownSrc = failed && fallbackSrc ? fallbackSrc : src;

  return (
    <TransformWrapper
      ref={ref}
      initialScale={1}
      minScale={1}
      maxScale={8}
      centerOnInit
      wheel={{ step: 0.12 }}
      doubleClick={{ mode: 'zoomIn', step: 0.9 }}
      pinch={{ step: 5 }}
      panning={{ velocityDisabled: true }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          {/* Controls */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-black/60 backdrop-blur px-1.5 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => zoomOut()}
              aria-label="Zoom out"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => resetTransform()}
              aria-label="Reset zoom"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => zoomIn()}
              aria-label="Zoom in"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%', cursor: 'grab' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            <div className="w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shownSrc}
                alt={alt}
                draggable={false}
                onLoad={() => ref.current?.resetTransform(0)}
                onError={() => {
                  if (fallbackSrc && !failed) setFailed(true);
                }}
                className="max-w-[92vw] max-h-[86vh] object-contain select-none"
              />
            </div>
          </TransformComponent>
        </>
      )}
    </TransformWrapper>
  );
}
