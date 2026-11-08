'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { linkHost } from '@/lib/collections/blur';

const SECONDS = 5;

interface LeavingSiteDialogProps {
  /** The source to go to, or null when closed. */
  href: string | null;
  onClose: () => void;
}

/**
 * Shown before a blurred image's link takes the visitor to the original at its
 * source. The countdown runs while they read; "Go now" opens the source in a
 * new tab. Browsers only open new tabs from a click, so nothing opens on its
 * own when the countdown ends.
 */
export function LeavingSiteDialog({ href, onClose }: LeavingSiteDialogProps) {
  return (
    <Dialog open={href !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Opened from inside the record viewer (z-[100], full-screen scan z-[110]), so it sits above both. */}
      <DialogContent
        overlayClassName="z-[120]"
        className="z-[130] border-brand-gold/[0.12] bg-brand-card text-brand-cream sm:max-w-md"
      >
        {/* Mounted per opening, so the countdown starts fresh each time. */}
        {href && <LeavingSiteBody href={href} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function LeavingSiteBody({ href, onClose }: { href: string; onClose: () => void }) {
  const [left, setLeft] = useState(SECONDS);
  const host = linkHost(href) || 'another site';

  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const done = left === 0;
  // The ring empties as the seconds run out.
  const circumference = 2 * Math.PI * 18;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-brand-cream">You&apos;re leaving Reparation Road</DialogTitle>
        <DialogDescription className="text-brand-muted">
          You&apos;re being redirected to the original image at <span className="text-brand-cream">{host}</span>. It
          opens in a new tab, so this record stays open here.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4 rounded-xl border border-brand-gold/[0.08] bg-brand-bg/50 p-4" aria-live="polite">
        <div className="relative h-11 w-11 flex-shrink-0" aria-hidden="true">
          <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" className="stroke-brand-gold/15" />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-brand-gold transition-[stroke-dashoffset] duration-1000 ease-linear"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - left / SECONDS)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-base font-semibold text-brand-cream">
            {done ? <Check className="h-4 w-4 text-brand-gold" /> : left}
          </span>
        </div>
        <p className="text-sm text-brand-cream-muted">
          {done ? (
            <>Click <span className="text-brand-cream">Go now</span> to open it.</>
          ) : (
            <>
              Redirecting in {left} second{left === 1 ? '' : 's'}…
            </>
          )}
        </p>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onClose} className="border-brand-gold/20 text-brand-cream rounded-xl">
          Stay here
        </Button>
        {/* A real link: a click is what lets the browser open a new tab. */}
        <Button asChild className={`bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl ${done ? 'ring-2 ring-brand-gold/40 ring-offset-2 ring-offset-brand-card' : ''}`}>
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            Go now <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}
