'use client';

import { useState, useMemo, useEffect } from 'react';
import { Copy, Check, Quote, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

interface RecordCitationProps {
  collection: Collection;
  record: CollectionRecord;
  /** Start expanded instead of collapsed. Defaults to collapsed. */
  defaultOpen?: boolean;
}

function buildCitation(
  collection: Collection,
  record: CollectionRecord,
  override: string | null,
): string {
  // An explicit per-record override wins outright.
  if (override && override.trim()) return override.trim();

  const recordTitle = getRecordTitle(record, collection.display_columns || []);
  const recordSlug = record.slug || record.id;
  const collectionSlug = collection.slug;
  const url = `reparationroad.org/collection/${collectionSlug}/${recordSlug}`;
  const accessedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Admin-set collection template.
  if (collection.citation_template) {
    return collection.citation_template
      .replace(/\{\{record_title\}\}/g, recordTitle)
      .replace(/\{\{collection_name\}\}/g, collection.name)
      .replace(/\{\{record_id\}\}/g, recordSlug)
      .replace(/\{\{collection_slug\}\}/g, collectionSlug)
      .replace(/\{\{accessed_date\}\}/g, accessedDate)
      .replace(/\{\{url\}\}/g, url);
  }

  // Default citation (Chicago/Turabian style).
  return `"${recordTitle}," ${collection.name}, Reparation Road Digital Archive, ${url}, accessed ${accessedDate}.`;
}

export function RecordCitation({ collection, record, defaultOpen = false }: RecordCitationProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [override, setOverride] = useState<{
    citation: string | null;
    source_information: string | null;
  } | null>(null);

  // Pull any per-record override (public read). Fails silently if the table
  // doesn't exist yet (before the migration is run) — the record just uses the
  // collection defaults.
  useEffect(() => {
    let active = true;
    if (!collection.table_name || !record.id) return;
    const supabase = createClient();
    supabase
      .from('record_citations')
      .select('citation, source_information')
      .eq('table_name', collection.table_name)
      .eq('record_id', record.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setOverride(data);
      });
    return () => {
      active = false;
    };
  }, [collection.table_name, record.id]);

  const citation = useMemo(
    () => buildCitation(collection, record, override?.citation ?? null),
    [collection, record, override],
  );

  const source =
    (override?.source_information && override.source_information.trim()) ||
    (collection.source_information && collection.source_information.trim()) ||
    null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-brand-gold/[0.08]">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-5 py-3 hover:bg-brand-card/40 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-brand-muted" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-brand-muted" />
        )}
        <Quote className="w-3.5 h-3.5 text-brand-muted" />
        <span className="text-[11px] text-brand-muted font-medium uppercase tracking-wide">
          Cite this Record
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          {/* Citation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-brand-muted font-medium uppercase tracking-wide">
                Citation
              </p>
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

          {/* Source information */}
          {source && (
            <div className="pt-2 border-t border-brand-gold/[0.06]">
              <p className="text-[10px] text-brand-muted font-medium uppercase tracking-wide mb-1.5">
                Source
              </p>
              <p className="text-xs text-brand-cream/70 leading-relaxed whitespace-pre-line select-all">
                {source}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
