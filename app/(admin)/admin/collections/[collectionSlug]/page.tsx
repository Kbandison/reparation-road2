import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCollectionBySlug, getCollectionRecords } from '@/lib/collections/queries';
import { PageHeader } from '@/components/shared/page-header';
import { AdminRecordsTable } from '@/components/admin/admin-records-table';
import { AdminCitationEditor } from '@/components/admin/admin-citation-editor';
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
  return { title: `Admin — ${collection?.name || 'Collection'}` };
}

export default async function AdminCollectionRecordsPage({ params, searchParams }: Props) {
  const { collectionSlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const search = sp.search || '';
  const pageSize = 50;

  const supabase = await createClient();
  const collection = await getCollectionBySlug(supabase, collectionSlug);

  if (!collection || !collection.table_name) notFound();

  const { data: records, count } = await getCollectionRecords(supabase, collection, {
    page,
    pageSize,
    search,
  });

  const totalPages = Math.ceil(count / pageSize);

  // Get parent info for breadcrumb
  const parent = collection.parent_slug
    ? await getCollectionBySlug(supabase, collection.parent_slug)
    : null;

  return (
    <>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-brand-muted mb-6">
        <Link href="/admin/collections" className="hover:text-brand-gold transition-colors">
          Collections
        </Link>
        {parent && (
          <>
            <span>/</span>
            <span className="text-brand-cream-muted">{parent.name}</span>
          </>
        )}
        <span>/</span>
        <span className="text-brand-cream font-medium">{collection.name}</span>
      </nav>

      <PageHeader
        eyebrow="Manage Records"
        title={collection.name}
        description={`${count} records · Table: ${collection.table_name} · Click any row to edit all fields`}
      />

      {/* Citation Template Editor */}
      <AdminCitationEditor collection={collection} />

      {/* Search */}
      <form className="mb-6">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search records..."
          className="bg-brand-card border border-brand-gold/[0.08] rounded-xl px-4 py-2.5 text-sm text-brand-cream placeholder:text-brand-muted w-full max-w-md focus:outline-none focus:border-brand-gold/30"
        />
      </form>

      <AdminRecordsTable
        collection={collection}
        records={records}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Link
            href={`/admin/collections/${collectionSlug}?page=${page - 1}${search ? `&search=${search}` : ''}`}
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
          <span className="text-sm text-brand-muted">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/admin/collections/${collectionSlug}?page=${page + 1}${search ? `&search=${search}` : ''}`}
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
  );
}
