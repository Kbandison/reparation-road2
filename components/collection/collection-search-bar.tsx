'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SearchInput } from '@/components/shared/search-input';

interface CollectionSearchBarProps {
  collectionSlug: string;
  initialSearch: string;
}

export function CollectionSearchBar({ collectionSlug, initialSearch }: CollectionSearchBarProps) {
  const router = useRouter();

  const handleSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value) params.set('search', value);
      router.push(`/collection/${collectionSlug}?${params.toString()}`);
    },
    [router, collectionSlug]
  );

  return (
    <SearchInput
      placeholder="Search records..."
      value={initialSearch}
      onSearch={handleSearch}
      className="mb-6 max-w-md"
    />
  );
}
