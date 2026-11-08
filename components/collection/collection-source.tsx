'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Copy } from 'lucide-react';
import { Linkify } from '@/components/shared/linkify';

interface CollectionSourceProps {
  /** The collection's source, or the nearest parent folder's. */
  source: string;
}

/** The archival source for a whole collection, shown on its landing page. */
export function CollectionSource({ source }: CollectionSourceProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      return; // Clipboard blocked (insecure context or permission). The text stays selectable.
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      aria-labelledby="collection-source-heading"
      className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-5 md:p-6 mb-6"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2
          id="collection-source-heading"
          className="flex items-center gap-2 font-display text-sm font-semibold text-brand-cream"
        >
          <BookOpen className="w-4 h-4 text-brand-gold" aria-hidden="true" />
          Source
        </h2>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-brand-sage" aria-hidden="true" />
              <span className="text-brand-sage">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <p className="text-sm text-brand-muted leading-relaxed whitespace-pre-line break-words">
        <Linkify text={source} />
      </p>
      {/* Announce the copy for screen readers without moving focus. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Source copied to clipboard' : ''}
      </span>
    </section>
  );
}
