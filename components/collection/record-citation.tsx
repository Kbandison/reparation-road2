'use client';

import { useState, useMemo, useEffect } from 'react';
import { Copy, Check, Quote, ChevronDown, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Collection, CollectionRecord } from '@/lib/types';
import {
  buildRecordCitation,
  cleanCitationText,
  fetchCitationChain,
  resolveCitationDefaults,
  type CitationDefaults,
} from '@/lib/collections/citation';
import { Linkify } from '@/components/shared/linkify';

interface RecordCitationProps {
  collection: Collection;
  record: CollectionRecord;
  /** Start expanded instead of collapsed. Defaults to collapsed. */
  defaultOpen?: boolean;
}

interface RecordOverride {
  citation: string | null;
  source_information: string | null;
}

export function RecordCitation({ collection, record, defaultOpen = false }: RecordCitationProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(defaultOpen);

  // Both lookups are stored with the key they were fetched for, so paging the
  // modal to another record or collection never shows the previous one's values
  // while the next fetch is in flight.
  const overrideKey = `${collection.table_name}:${record.id}`;
  const [fetchedOverride, setFetchedOverride] = useState<{ key: string; data: RecordOverride | null } | null>(null);
  const [fetchedDefaults, setFetchedDefaults] = useState<{ slug: string; defaults: CitationDefaults } | null>(null);

  // Per-record override (public read).
  useEffect(() => {
    let active = true;
    if (!collection.table_name || !record.id) return;
    const key = `${collection.table_name}:${record.id}`;
    createClient()
      .from('record_citations')
      .select('citation, source_information')
      .eq('table_name', collection.table_name)
      .eq('record_id', record.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setFetchedOverride({ key, data: data ?? null });
      });
    return () => {
      active = false;
    };
  }, [collection.table_name, record.id]);

  // Collection defaults with the parent-folder fallback. Read fresh because
  // some callers pass a partial collection row.
  useEffect(() => {
    let active = true;
    const slug = collection.slug;
    fetchCitationChain(createClient(), slug).then((chain) => {
      if (active && chain.length > 0) setFetchedDefaults({ slug, defaults: resolveCitationDefaults(chain) });
    });
    return () => {
      active = false;
    };
  }, [collection.slug]);

  const override = fetchedOverride?.key === overrideKey ? fetchedOverride.data : null;
  // Until the chain arrives, use whatever the collection row itself carries.
  const defaults = useMemo(
    () =>
      fetchedDefaults?.slug === collection.slug
        ? fetchedDefaults.defaults
        : resolveCitationDefaults([collection]),
    [fetchedDefaults, collection],
  );

  const citation = useMemo(
    () =>
      buildRecordCitation(
        collection,
        record,
        defaults.citationTemplate?.value ?? null,
        override?.citation ?? null,
      ),
    [collection, record, defaults, override],
  );

  const source = cleanCitationText(override?.source_information) ?? defaults.sourceInformation?.value ?? null;

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
                <Linkify text={source} />
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
