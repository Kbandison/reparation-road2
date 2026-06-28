'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  title?: string;
}

// The dialog chrome for the feed's intercepting-route modals. Closing pops the
// route (router.back), so the URL returns to the feed and a refresh of the
// underlying thread/new URL still renders the full standalone page.
export function ModalShell({ children, title }: Props) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={close} aria-hidden />
      <div className="relative z-10 w-full max-w-2xl my-2 sm:my-6 bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-brand-gold/[0.08] bg-brand-bg/95 backdrop-blur rounded-t-2xl">
          <p className="text-sm font-semibold text-brand-cream truncate pr-3">{title}</p>
          <button
            onClick={close}
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
