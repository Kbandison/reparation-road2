'use client';

import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { linkHost } from '@/lib/collections/blur';
import { LeavingSiteDialog } from '@/components/collection/leaving-site-dialog';

interface SourceLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/**
 * A link to a blurred image's original at its source. Clicking it first shows
 * the "You're leaving Reparation Road" dialog, which opens the source.
 */
export function SourceLink({ href, className = '', children, 'aria-label': ariaLabel }: SourceLinkProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={ariaLabel} aria-haspopup="dialog">
        {children}
      </button>
      <LeavingSiteDialog href={open ? href : null} onClose={() => setOpen(false)} />
    </>
  );
}

interface SourceImageLinkProps {
  href: string;
  /** Rounds the focus ring to match the image it covers. */
  className?: string;
}

/**
 * Covers a blurred scan so the whole image leads to the original at its
 * source. The label shows on hover or keyboard focus; on touch screens (no
 * hover) it stays visible. Place inside a `relative` container.
 */
export function SourceImageLink({ href, className = '' }: SourceImageLinkProps) {
  const host = linkHost(href);
  return (
    <SourceLink
      href={href}
      aria-label={`View the original image${host ? ` at ${host}` : ''}`}
      className={`group/source absolute inset-0 z-10 flex items-end justify-center p-3 bg-black/0 hover:bg-black/25 focus-visible:bg-black/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-gold cursor-pointer ${className}`}
    >
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-brand-bg/90 px-3 py-2 text-xs font-medium text-brand-cream shadow-lg ring-1 ring-brand-gold/25 backdrop-blur transition-opacity opacity-0 group-hover/source:opacity-100 group-focus-visible/source:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="truncate">View the original image{host && <span className="text-brand-muted"> at {host}</span>}</span>
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-brand-gold" aria-hidden="true" />
      </span>
    </SourceLink>
  );
}
