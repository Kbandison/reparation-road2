import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCollectionBySlug, getCollectionRecords, getChildCollections } from '@/lib/collections/queries';
import { checkCollectionAccess } from '@/lib/collections/access';
import { getCategoryColor } from '@/lib/collections/helpers';
import { formatNumber, snakeCaseToTitleCase } from '@/lib/utils/format';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { PagePagination } from '@/components/shared/page-pagination';
import { RecordTable } from '@/components/collection/record-table';
import { BookGrid } from '@/components/collection/book-grid';
import { SubcollectionGrid } from '@/components/collection/subcollection-grid';
import { CollectionSearchBar } from '@/components/collection/collection-search-bar';
import { AccessGate } from '@/components/collection/access-gate';
import { ActivityTracker } from '@/components/collection/activity-tracker';
import { BookmarkRecordOpener } from '@/components/collection/bookmark-record-opener';
import { ComingSoon } from '@/components/collection/coming-soon';

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

    // Check which children are themselves parents (have their own subcollections)
    const parentSlugs = new Set<string>();
    if (children.length > 0) {
      const childSlugs = children.map((c) => c.slug);
      const { data: grandchildren } = await supabase
        .from('collections')
        .select('parent_slug')
        .in('parent_slug', childSlugs)
        .eq('is_published', true);
      if (grandchildren) {
        grandchildren.forEach((gc: { parent_slug: string }) => parentSlugs.add(gc.parent_slug));
      }
    }

    return (
      <>
        <ActivityTracker type="collection" slug={collectionSlug} name={collection.name} />
        <Breadcrumbs items={[
          { label: 'Collections', href: '/collection' },
          { label: collection.name },
        ]} />

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
          {children.length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-brand-card-hover text-brand-cream-muted font-medium">
              {children.length} subcollections
            </span>
          )}
        </div>

        {children.length > 0 ? (
          <SubcollectionGrid children={children} parentSlugs={parentSlugs} />
        ) : (
          <ComingSoon collectionName={collection.name} />
        )}
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
      <Breadcrumbs items={[
        { label: 'Collections', href: '/collection' },
        ...(parentCollection ? [{ label: parentCollection.name, href: `/collection/${parentCollection.slug}` }] : []),
        { label: collection.name },
      ]} />

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

          <PagePagination
            currentPage={page}
            totalPages={totalPages}
            buildHref={(p) => `/collection/${collectionSlug}?page=${p}${search ? `&search=${search}` : ''}`}
          />
        </>
      )}

      <BookmarkRecordOpener collectionSlug={collectionSlug} />
    </>
  );
}
