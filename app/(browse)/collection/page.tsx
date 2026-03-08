import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCollections } from '@/lib/collections/queries';
import { PageHeader } from '@/components/shared/page-header';
import { CollectionCard } from '@/components/collection/collection-card';
import { CollectionFilters } from '@/components/collection/collection-filters';
import { GlobalCollectionSearch } from '@/components/collection/global-collection-search';
import { RecentActivity } from '@/components/collection/recent-activity';
import { Library } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';

export const metadata: Metadata = {
  title: 'Collections',
};

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; era?: string; region?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const hasFilters = params.category || params.era || params.region;

  let collections: Awaited<ReturnType<typeof getCollections>> = [];
  let allTopLevel: Awaited<ReturnType<typeof getCollections>> = [];
  try {
    collections = await getCollections(supabase, {
      topLevelOnly: true,
      category: params.category,
      era: params.era,
      region: params.region,
    });
    allTopLevel = hasFilters ? await getCollections(supabase, { topLevelOnly: true }) : collections;
  } catch {
    collections = [];
    allTopLevel = [];
  }

  const categories = [...new Set(allTopLevel.map((c) => c.category))].sort();
  const eras = [...new Set(allTopLevel.map((c) => c.era).filter(Boolean))] as string[];
  const regions = [...new Set(allTopLevel.map((c) => c.region).filter(Boolean))] as string[];

  const freeCollections = collections.filter((c) => c.access_tier === 'free');
  const premiumCollections = collections.filter((c) => c.access_tier !== 'free');

  return (
    <>
      <PageHeader
        eyebrow="The Archive"
        title="Explore the Collections"
        description="Browse our growing archive of historical records, census data, military records, and more."
      />

      <GlobalCollectionSearch
        filters={
          allTopLevel.length > 0
            ? <CollectionFilters categories={categories} eras={eras} regions={regions} />
            : undefined
        }
      >
        {collections.length > 0 ? (
          <>
            {freeCollections.length > 0 && (
              <div className="mb-10">
                <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">
                  Free Collections
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {freeCollections.map((collection) => (
                    <CollectionCard key={collection.id} collection={collection} />
                  ))}
                </div>
              </div>
            )}

            {premiumCollections.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">
                  Premium Collections
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {premiumCollections.map((collection) => (
                    <CollectionCard key={collection.id} collection={collection} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Library}
            title="No Collections Found"
            description="Collections are being set up. Check back soon, or try adjusting your filters."
          />
        )}
      </GlobalCollectionSearch>

      {/* Floating recent activity - overlays on right, doesn't affect layout */}
      <RecentActivity />
    </>
  );
}
