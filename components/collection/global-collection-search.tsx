'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Search, Loader2, Library, FolderOpen, FileText, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RecordModal } from '@/components/collection/record-modal';
import { snakeCaseToTitleCase } from '@/lib/utils/format';
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
}

interface SearchResults {
  collections: CollectionResult[];
  subcollections: SubcollectionResult[];
  records: RecordResult[];
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

  const before = (contextStart > 0 ? '...' : '') + text.slice(contextStart, idx);
  const match = text.slice(idx, matchEnd);
  const after = text.slice(matchEnd, contextEnd) + (contextEnd < text.length ? '...' : '');

  return (
    <>
      {before}
      <mark className="bg-brand-gold/30 text-brand-cream rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

interface Props {
  children: React.ReactNode;
}

export function GlobalCollectionSearch({ children }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Modal state
  const [modalRecord, setModalRecord] = useState<CollectionRecord | null>(null);
  const [modalCollection, setModalCollection] = useState<Collection | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const isSearching = hasSearched && query.trim().length >= 2;

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

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
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(value), 400);
  }

  function clearSearch() {
    setQuery('');
    setResults(null);
    setHasSearched(false);
  }

  async function openRecordModal(r: RecordResult) {
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/collection-search/record?collection=${encodeURIComponent(r.collectionSlug)}&id=${encodeURIComponent(r.id)}`
      );
      const data = await res.json();
      if (data.collection && data.record) {
        setModalCollection(data.collection);
        setModalRecord(data.record);
      }
    } catch {
      // silently fail
    }
    setModalLoading(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalResults =
    (results?.collections.length || 0) +
    (results?.subcollections.length || 0) +
    (results?.records.length || 0);

  return (
    <>
      {/* Search bar */}
      <div className="mb-8">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
          <Input
            type="text"
            placeholder="Search all collections and records..."
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            className="pl-12 pr-12 h-12 text-base bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold rounded-xl"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg text-brand-muted hover:text-brand-cream transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {(loading || modalLoading) && (
            <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-brand-gold" />
          )}
        </div>
      </div>

      {/* Show search results OR collection grid */}
      {isSearching ? (
        <div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
            </div>
          ) : results && totalResults === 0 ? (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 text-center">
              <Search className="w-8 h-8 text-brand-muted mx-auto mb-3" />
              <p className="text-brand-cream font-display text-lg font-semibold mb-1">No results found</p>
              <p className="text-sm text-brand-muted">
                Try a different search term or{' '}
                <button onClick={clearSearch} className="text-brand-gold hover:text-brand-gold-light">
                  clear the search
                </button>{' '}
                to browse collections.
              </p>
            </div>
          ) : results && (
            <div className="space-y-8">
              <p className="text-sm text-brand-muted">
                Found {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
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
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              c.accessTier === 'free'
                                ? 'bg-brand-sage/10 text-brand-sage'
                                : 'bg-brand-gold/10 text-brand-gold'
                            }`}>
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
                            <p className="text-xs text-brand-muted mt-0.5">
                              in {c.parentName}
                            </p>
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

              {/* Records */}
              {results.records.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-brand-burgundy-light" />
                    <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                      Records ({results.records.length})
                    </h3>
                  </div>
                  <div className="grid gap-3">
                    {results.records.map((r) => (
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
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-card-hover text-brand-muted whitespace-nowrap flex-shrink-0">
                            {r.collectionName}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        // Show the normal collection grid
        children
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
