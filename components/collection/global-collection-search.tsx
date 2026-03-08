'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Search, Loader2, Library, FolderOpen, FileText, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { snakeCaseToTitleCase } from '@/lib/utils/format';

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

  // Show context around match — up to 80 chars before, match, up to 80 chars after
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

export function GlobalCollectionSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

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
    debounceRef.current = setTimeout(() => search(value), 400);
  }

  function clearSearch() {
    setQuery('');
    setResults(null);
    setHasSearched(false);
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
    <div className="mb-8">
      {/* Search bar */}
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
        {loading && (
          <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-brand-gold" />
        )}
      </div>

      {/* Results */}
      {hasSearched && results && !loading && (
        <div className="mt-6 max-w-4xl mx-auto">
          {totalResults === 0 ? (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 text-center">
              <Search className="w-8 h-8 text-brand-muted mx-auto mb-3" />
              <p className="text-brand-cream font-display text-lg font-semibold mb-1">No results found</p>
              <p className="text-sm text-brand-muted">
                Try a different search term or browse the collections below.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-brand-muted">
                Found {totalResults} result{totalResults !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
              </p>

              {/* Collections */}
              {results.collections.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Library className="w-4 h-4 text-brand-gold" />
                    <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                      Collections ({results.collections.length})
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {results.collections.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/collection/${c.slug}`}
                        className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 hover:border-brand-gold/25 transition-colors block group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-base font-semibold text-brand-cream group-hover:text-brand-gold transition-colors">
                              <HighlightMatch text={c.name} query={query} />
                            </p>
                            {c.shortDescription && (
                              <p className="text-sm text-brand-muted mt-1 line-clamp-1">
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
                </div>
              )}

              {/* Subcollections */}
              {results.subcollections.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FolderOpen className="w-4 h-4 text-brand-sage" />
                    <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                      Subcollections ({results.subcollections.length})
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {results.subcollections.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/collection/${c.slug}`}
                        className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 hover:border-brand-gold/25 transition-colors block group"
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
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-muted/10 text-brand-muted">
                              {c.recordCount} records
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Records */}
              {results.records.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-brand-burgundy-light" />
                    <h3 className="font-display text-sm font-semibold text-brand-cream uppercase tracking-wide">
                      Records ({results.records.length})
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {results.records.map((r) => (
                      <Link
                        key={`${r.collectionSlug}-${r.id}`}
                        href={`/collection/${r.collectionSlug}/${r.slug || r.id}`}
                        className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 hover:border-brand-gold/25 transition-colors block group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {/* Display fields as the title */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              {Object.entries(r.displayFields).map(([key, val]) => (
                                <span key={key} className="text-sm">
                                  <span className="text-brand-muted text-xs mr-1">{snakeCaseToTitleCase(key)}:</span>
                                  <span className="text-brand-cream font-medium">
                                    <HighlightMatch text={val} query={query} />
                                  </span>
                                </span>
                              ))}
                            </div>
                            {/* Show the matched field if not in display fields */}
                            {!r.displayFields[r.matchField] && (
                              <p className="text-xs text-brand-muted mt-1.5 line-clamp-2">
                                <span className="text-brand-muted/70">{snakeCaseToTitleCase(r.matchField)}: </span>
                                <HighlightMatch text={r.matchValue} query={query} />
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-card-hover text-brand-muted whitespace-nowrap flex-shrink-0">
                            {r.collectionName}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
