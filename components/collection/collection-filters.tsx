'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { snakeCaseToTitleCase } from '@/lib/utils/format';

interface CollectionFiltersProps {
  categories: string[];
  eras: string[];
  regions: string[];
}

export function CollectionFilters({ categories, eras, regions }: CollectionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get('category') || '';
  const currentEra = searchParams.get('era') || '';
  const currentRegion = searchParams.get('region') || '';

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/collection?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={currentCategory}
        onChange={(e) => updateFilter('category', e.target.value)}
        className="bg-brand-card border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
      >
        <option value="">All Categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>{snakeCaseToTitleCase(cat)}</option>
        ))}
      </select>

      <select
        value={currentEra}
        onChange={(e) => updateFilter('era', e.target.value)}
        className="bg-brand-card border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
      >
        <option value="">All Eras</option>
        {eras.map((era) => (
          <option key={era} value={era}>{snakeCaseToTitleCase(era)}</option>
        ))}
      </select>

      <select
        value={currentRegion}
        onChange={(e) => updateFilter('region', e.target.value)}
        className="bg-brand-card border border-brand-gold/[0.15] rounded-xl px-3 py-2 text-sm text-brand-cream focus:border-brand-gold focus:outline-none"
      >
        <option value="">All Regions</option>
        {regions.map((region) => (
          <option key={region} value={region}>{snakeCaseToTitleCase(region)}</option>
        ))}
      </select>

      {(currentCategory || currentEra || currentRegion) && (
        <button
          onClick={() => router.push('/collection')}
          className="text-xs text-brand-gold hover:text-brand-gold-light px-3 py-2"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
