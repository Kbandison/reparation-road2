'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, Quote } from 'lucide-react';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

interface RecordCitationProps {
  collection: Collection;
  record: CollectionRecord;
}

function buildCitation(
  collection: Collection,
  record: CollectionRecord,
): string {
  const recordTitle = getRecordTitle(record, collection.display_columns || []);
  const recordSlug = record.slug || record.id;
  const collectionSlug = collection.slug;
  const url = `reparationroad.org/collection/${collectionSlug}/${recordSlug}`;
  const accessedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // If admin has set a custom template, interpolate placeholders
  if (collection.citation_template) {
    return collection.citation_template
      .replace(/\{\{record_title\}\}/g, recordTitle)
      .replace(/\{\{collection_name\}\}/g, collection.name)
      .replace(/\{\{record_id\}\}/g, recordSlug)
      .replace(/\{\{collection_slug\}\}/g, collectionSlug)
      .replace(/\{\{accessed_date\}\}/g, accessedDate)
      .replace(/\{\{url\}\}/g, url);
  }

  // Default citation (Chicago/Turabian style)
  return `"${recordTitle}," ${collection.name}, Reparation Road Digital Archive, ${url}, accessed ${accessedDate}.`;
}

export function RecordCitation({ collection, record }: RecordCitationProps) {
  const [copied, setCopied] = useState(false);

  const citation = useMemo(
    () => buildCitation(collection, record),
    [collection, record]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-brand-gold/[0.08] px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Quote className="w-3.5 h-3.5 text-brand-muted" />
          <p className="text-[11px] text-brand-muted font-medium uppercase tracking-wide">
            Cite this Record
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-brand-muted hover:text-brand-cream hover:bg-brand-card transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-brand-sage" />
              <span className="text-brand-sage">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-brand-cream/70 leading-relaxed italic select-all">
        {citation}
      </p>
    </div>
  );
}
