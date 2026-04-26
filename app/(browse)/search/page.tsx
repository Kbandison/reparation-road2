'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, Loader2, Library, FolderOpen, FileText, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import { RecordModal } from '@/components/collection/record-modal';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
import { trackActivity } from '@/lib/hooks/use-activity';
import { EmptyState } from '@/components/shared/empty-state';
import type { Collection, CollectionRecord } from '@/lib/types';

interface CollectionResult {
  slug: string;
  name: string;
  shortDescription: string | null;
  category: string;
  recordCount: number;
  accessTier: string;
}

interface SubcollectionResult {
  slug: string;
  name: string;
  shortDescription: string | null;
  parentSlug: string;
  parentName: string;
  category: string;
  recordCount: number;
  accessTier: string;
}

interface RecordResult {
  id: string;
  slug?: string;
  collectionSlug: string;
  collectionName: string;
  parentSlug: string | null;
  matchField: string;
  matchValue: string;
  displayFields: Record<string, string>;
  score: number;
}

interface CollectionRecordGroup {
  collectionSlug: string;
  collectionName: string;
  parentSlug: string | null;
  parentName: string | null;
  total: number;
  records: RecordResult[];
}

interface SearchResults {
  collections: CollectionResult[];
  subcollections: SubcollectionResult[];
  records: CollectionRecordGroup[];
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;

  const matchEnd = idx + query.length;
  const contextStart = Math.max(0, idx - 80);
  const contextEnd = Math.min(text.length, matchEnd + 80);

  return (
    <>
      {(contextStart > 0 ? '...' : '') + text.slice(contextStart, idx)}
      <mark className="bg-brand-gold/30 text-brand-cream rounded px-0.5">
        {text.slice(idx, matchEnd)}
      </mark>
      {text.slice(matchEnd, contextEnd) + (contextEnd < text.length ? '...' : '')}
    </>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Modal state
  const [modalRecord, setModalRecord] = useState<CollectionRecord | null>(null);
  const [modalCollection, setModalCollection] = useState<Collection | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/collection-search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data);
    } catch {
      setResults({ collections: [], subcollections: [], records: [] });
    }

    setLoading(false);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(value), 400);
  }

  async function loadMore(group: CollectionRecordGroup) {
    if (!results) return;
    setLoadingMore(group.collectionSlug);
    try {
      const res = await fetch(
        `/api/collection-search?q=${encodeURIComponent(query.trim())}&collection=${encodeURIComponent(group.collectionSlug)}&offset=${group.records.length}`,
      );
      const data = await res.json();
      const more: CollectionRecordGroup | undefined = data.records?.[0];
      if (more && more.records?.length) {
        setResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            records: prev.records.map((g) =>
              g.collectionSlug === group.collectionSlug
                ? { ...g, records: [...g.records, ...more.records] }
                : g,
            ),
          };
        });
      }
    } catch {
      // no-op; user can try again
    }
    setLoadingMore(null);
  }

  async function openRecordModal(r: RecordResult) {
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/collection-search/record?collection=${encodeURIComponent(r.collectionSlug)}&id=${encodeURIComponent(r.id)}`,
      );
      const data = await res.json();
      if (data.collection && data.record) {
        setModalCollection(data.collection);
        setModalRecord(data.record);
        trackActivity({
          type: 'record',
          slug: data.record.slug || r.id,
          name: String(
            data.collection.display_columns?.[0]
              ? data.record[data.collection.display_columns[0]] ?? r.id
              : r.id,
          ),
          collectionSlug: r.collectionSlug,
          collectionName: r.collectionName,
        });
      }
    } catch {
      // silently fail
    }
    setModalLoading(false);
  }

  const totalRecords = results?.records.reduce((acc, g) => acc + g.total, 0) || 0;
  const totalShown = results?.records.reduce((acc, g) => acc + g.records.length, 0) || 0;
  const totalGroups =
    (results?.collections.length || 0) +
    (results?.subcollections.length || 0) +
    (results?.records.length || 0);

  return (
    <>
      <PageHeader
        eyebrow="Search"
        title="Search the Archive"
        description="Search across all collections to find records, names, and historical data."
      />

      <div className="relative max-w-xl mb-8">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
        <Input
          type="text"
          placeholder="Search names, places, records..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
          className="pl-10 h-[42px] text-sm bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold rounded-xl"
        />
        {(loading || modalLoading) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-brand-gold" />
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
        </div>
      )}

      {!loading && searched && totalGroups === 0 && (
        <EmptyState
          icon={Search}
          title="No Results Found"
          description="Try different keywords or check the spelling."
        />
      )}

      {!loading && results && totalGroups > 0 && (
        <div className="space-y-8">
          <p className="text-sm text-brand-muted">
            {totalRecords > 0 ? (
              <>
                Found {totalRecords} record match{totalRecords !== 1 ? 'es' : ''}
                {totalShown < totalRecords && <> (showing {totalShown})</>}
                {' '}plus{' '}
                {results.collections.length + results.subcollections.length} collection match
                {results.collections.length + results.subcollections.length !== 1 ? 'es' : ''}
                {' for '}&ldquo;{query}&rdquo;
              </>
            ) : (
              <>
                Found {results.collections.length + results.subcollections.length} collection match
                {results.collections.length + results.subcollections.length !== 1 ? 'es' : ''}
                {' for '}&ldquo;{query}&rdquo;
              </>
            )}
          </p>

          {/* Collections */}
          {results.collections.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Library className="w-4 h-4 text-brand-gold" />
                <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                  Collections ({results.collections.length})
                </h3>
              </div>
              <div className="grid gap-3">
                {results.collections.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/collection/${c.slug}`}
                    className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-5 hover:border-brand-gold/25 transition-all hover:-translate-y-0.5 block group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-semibold text-brand-cream group-hover:text-brand-gold transition-colors">
                          <HighlightMatch text={c.name} query={query} />
                        </p>
                        {c.shortDescription && (
                          <p className="text-sm text-brand-muted mt-1 line-clamp-2">
                            <HighlightMatch text={c.shortDescription} query={query} />
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-muted/10 text-brand-muted">
                          {c.recordCount} records
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.accessTier === 'free'
                              ? 'bg-brand-sage/10 text-brand-sage'
                              : 'bg-brand-gold/10 text-brand-gold'
                          }`}
                        >
                          {c.accessTier === 'free' ? 'Free' : 'Premium'}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Subcollections */}
          {results.subcollections.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="w-4 h-4 text-brand-sage" />
                <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                  Subcollections ({results.subcollections.length})
                </h3>
              </div>
              <div className="grid gap-3">
                {results.subcollections.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/collection/${c.slug}`}
                    className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-5 hover:border-brand-gold/25 transition-all hover:-translate-y-0.5 block group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base font-semibold text-brand-cream group-hover:text-brand-gold transition-colors">
                          <HighlightMatch text={c.name} query={query} />
                        </p>
                        <p className="text-xs text-brand-muted mt-0.5">in {c.parentName}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-muted/10 text-brand-muted flex-shrink-0">
                        {c.recordCount} records
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Records, grouped by collection */}
          {results.records.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-burgundy-light" />
                <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                  Records ({totalRecords})
                </h3>
              </div>

              {results.records.map((group) => {
                const remaining = group.total - group.records.length;
                return (
                  <div key={group.collectionSlug} className="space-y-3">
                    <div className="flex items-baseline justify-between gap-3 border-b border-brand-gold/[0.08] pb-2">
                      <div className="min-w-0">
                        <Link
                          href={`/collection/${group.collectionSlug}`}
                          className="font-display text-sm font-semibold text-brand-cream hover:text-brand-gold transition-colors"
                        >
                          {group.collectionName}
                        </Link>
                        {group.parentName && (
                          <span className="text-xs text-brand-muted ml-2">in {group.parentName}</span>
                        )}
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-card-hover text-brand-muted whitespace-nowrap flex-shrink-0">
                        {group.records.length} of {group.total}
                      </span>
                    </div>

                    <div className="grid gap-3">
                      {group.records.map((r) => (
                        <button
                          key={`${r.collectionSlug}-${r.id}`}
                          onClick={() => openRecordModal(r)}
                          className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-5 hover:border-brand-gold/25 transition-all hover:-translate-y-0.5 block w-full text-left group"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                {Object.entries(r.displayFields).map(([key, val]) => (
                                  <span key={key} className="text-sm">
                                    <span className="text-brand-muted text-xs mr-1">
                                      {snakeCaseToTitleCase(key)}:
                                    </span>
                                    <span className="text-brand-cream font-medium group-hover:text-brand-gold transition-colors">
                                      <HighlightMatch text={val} query={query} />
                                    </span>
                                  </span>
                                ))}
                              </div>
                              {!r.displayFields[r.matchField] && (
                                <p className="text-xs text-brand-muted mt-2 line-clamp-2">
                                  <span className="text-brand-muted/70">
                                    {snakeCaseToTitleCase(r.matchField)}:{' '}
                                  </span>
                                  <HighlightMatch text={r.matchValue} query={query} />
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    {remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => loadMore(group)}
                        disabled={loadingMore === group.collectionSlug}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-brand-gold border border-brand-gold/15 hover:border-brand-gold/40 hover:bg-brand-gold/5 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {loadingMore === group.collectionSlug ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Show {remaining} more in {group.collectionName}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      {/* Record detail modal */}
      {modalRecord && modalCollection && (
        <RecordModal
          collection={modalCollection}
          record={modalRecord}
          onClose={() => {
            setModalRecord(null);
            setModalCollection(null);
          }}
        />
      )}
    </>
  );
}
