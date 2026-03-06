'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { SearchInput } from '@/components/shared/search-input';
import { PageHeader } from '@/components/shared/page-header';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Search } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';

interface SearchResult {
  collection: Collection;
  records: CollectionRecord[];
}

export default function SearchPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    const supabase = createClient();

    const { data: collections } = await supabase
      .from('collections')
      .select('*')
      .eq('is_published', true);

    if (!collections) {
      setLoading(false);
      return;
    }

    const searchResults: SearchResult[] = [];

    for (const collection of collections) {
      if (!collection.search_columns || collection.search_columns.length === 0) continue;

      const selectColumns = ['id', 'slug', ...collection.display_columns].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      const orFilter = collection.search_columns
        .map((col: string) => `${col}.ilike.%${query}%`)
        .join(',');

      const { data: records } = await supabase
        .from(collection.table_name)
        .select(selectColumns.join(','))
        .or(orFilter)
        .limit(5);

      if (records && records.length > 0) {
        searchResults.push({
          collection: collection as Collection,
          records: records as unknown as CollectionRecord[],
        });
      }
    }

    setResults(searchResults);
    setLoading(false);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Search"
        title="Search the Archive"
        description="Search across all collections to find records, names, and historical data."
      />

      <SearchInput
        placeholder="Search names, places, records..."
        onSearch={handleSearch}
        debounceMs={500}
        autoFocus
        className="max-w-xl mb-8"
      />

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState
          icon={Search}
          title="No Results Found"
          description="Try different keywords or check the spelling."
        />
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-8">
          {results.map((result) => (
            <div key={result.collection.id}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg font-semibold text-brand-cream">
                  {result.collection.name}
                </h2>
                <Link
                  href={`/collection/${result.collection.slug}`}
                  className="text-xs text-brand-gold hover:text-brand-gold-light"
                >
                  View all
                </Link>
              </div>
              <div className="space-y-2">
                {result.records.map((record) => (
                  <Link
                    key={record.id}
                    href={`/collection/${result.collection.slug}/${record.slug || record.id}`}
                    className="block bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 hover:border-brand-gold/25 transition-colors"
                  >
                    <p className="text-sm font-medium text-brand-gold">
                      {getRecordTitle(record, result.collection.display_columns)}
                    </p>
                    <p className="text-xs text-brand-muted mt-1">
                      {result.collection.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
