import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCollectionBySlug, getCollectionRecords, getChildCollections } from '@/lib/collections/queries';
import { checkCollectionAccess } from '@/lib/collections/access';
import { getCategoryColor } from '@/lib/collections/helpers';
import { formatNumber, snakeCaseToTitleCase } from '@/lib/utils/format';
import { PageHeader } from '@/components/shared/page-header';
import { RecordTable } from '@/components/collection/record-table';
import { BookGrid } from '@/components/collection/book-grid';
import { SubcollectionGrid } from '@/components/collection/subcollection-grid';
import { CollectionSearchBar } from '@/components/collection/collection-search-bar';
import { AccessGate } from '@/components/collection/access-gate';
import { ActivityTracker } from '@/components/collection/activity-tracker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{ collectionSlug: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionSlug } = await params;
  const supabase = await createClient();
  const collection = await getCollectionBySlug(supabase, collectionSlug);
  if (!collection) return { title: 'Collection Not Found' };
  return {
    title: collection.name,
    description: collection.short_description || undefined,
  };
}

export default async function CollectionBrowserPage({ params, searchParams }: Props) {
  const { collectionSlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const search = sp.search || '';

  const supabase = await createClient();
  const collection = await getCollectionBySlug(supabase, collectionSlug);
  const pageSize = collection?.display_type === 'book' ? 20 : 25;

  if (!collection) notFound();

  const isParent = !collection.table_name;

  // Parent collection → show subcollections
  if (isParent) {
    const children = await getChildCollections(supabase, collectionSlug);

    return (
      <>
        <ActivityTracker type="collection" slug={collectionSlug} name={collection.name} />
        <div className="mb-2">
          <Link href="/collection" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
            &larr; All Collections
          </Link>
        </div>

        <PageHeader title={collection.name} description={collection.short_description || undefined} />

        {collection.long_description && (
          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-8">
            <h2 className="font-display text-sm font-semibold text-brand-cream mb-2">About This Collection</h2>
            <p className="text-sm text-brand-muted leading-relaxed">{collection.long_description}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getCategoryColor(collection.category)}`}>
            {snakeCaseToTitleCase(collection.category)}
          </span>
          {collection.era && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/10 text-brand-muted font-medium">
              {snakeCaseToTitleCase(collection.era)}
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-card-hover text-brand-cream-muted font-medium">
            {children.length} subcollections
          </span>
        </div>

        <SubcollectionGrid children={children} />
      </>
    );
  }

  // Leaf collection — check access
  const access = await checkCollectionAccess(supabase, collection);

  // Breadcrumb: show parent if exists
  const parentCollection = collection.parent_slug
    ? await getCollectionBySlug(supabase, collection.parent_slug)
    : null;

  let records: Awaited<ReturnType<typeof getCollectionRecords>>['data'] = [];
  let count = 0;

  if (access.hasAccess) {
    try {
      const result = await getCollectionRecords(supabase, collection, {
        page,
        pageSize,
        search,
      });
      records = result.data;
      count = result.count;
    } catch (err) {
      console.error('Error loading collection records:', err);
    }
  }

  const totalPages = Math.ceil(count / pageSize);

  return (
    <>
      <ActivityTracker
        type={collection.parent_slug ? 'subcollection' : 'collection'}
        slug={collectionSlug}
        name={collection.name}
        parentSlug={collection.parent_slug || undefined}
        parentName={parentCollection?.name}
      />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-brand-muted mb-2">
        <Link href="/collection" className="hover:text-brand-gold transition-colors">
          Collections
        </Link>
        {parentCollection && (
          <>
            <span>/</span>
            <Link href={`/collection/${parentCollection.slug}`} className="hover:text-brand-gold transition-colors">
              {parentCollection.name}
            </Link>
          </>
        )}
      </div>

      <PageHeader title={collection.name} description={collection.short_description || undefined} />

      <div className="flex flex-wrap gap-2 mb-6">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getCategoryColor(collection.category)}`}>
          {snakeCaseToTitleCase(collection.category)}
        </span>
        {collection.era && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/10 text-brand-muted font-medium">
            {snakeCaseToTitleCase(collection.era)}
          </span>
        )}
        {collection.region && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-muted/10 text-brand-muted font-medium">
            {snakeCaseToTitleCase(collection.region)}
          </span>
        )}
        {access.hasAccess && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-card-hover text-brand-cream-muted font-medium">
            {formatNumber(count)} records
          </span>
        )}
      </div>

      {!access.hasAccess ? (
        <AccessGate collection={collection} reason={access.reason!} />
      ) : (
        <>
          <CollectionSearchBar collectionSlug={collectionSlug} initialSearch={search} />

          {collection.display_type === 'book' ? (
            <BookGrid collection={collection} records={records} />
          ) : (
            <RecordTable collection={collection} records={records} />
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Link
                href={`/collection/${collectionSlug}?page=${page - 1}${search ? `&search=${search}` : ''}`}
                className={page <= 1 ? 'pointer-events-none' : ''}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className="border-brand-gold/20 text-brand-cream"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
              </Link>
              <span className="text-sm text-brand-muted">Page {page} of {totalPages}</span>
              <Link
                href={`/collection/${collectionSlug}?page=${page + 1}${search ? `&search=${search}` : ''}`}
                className={page >= totalPages ? 'pointer-events-none' : ''}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  className="border-brand-gold/20 text-brand-cream"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
