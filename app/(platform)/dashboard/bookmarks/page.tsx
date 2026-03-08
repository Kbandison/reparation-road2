import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Bookmark, ArrowRight } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils/format';
import { DeleteBookmarkButton } from '@/components/dashboard/delete-bookmark-button';
import { BookmarkLink } from '@/components/collection/bookmark-link';

export const metadata: Metadata = {
  title: 'Bookmarks',
};

export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || '1');
  const pageSize = 25;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: bookmarks, count } = await supabase
    .from('bookmarks_unified')
    .select('*', { count: 'exact' })
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const totalPages = Math.ceil((count || 0) / pageSize);

  if (!bookmarks || bookmarks.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Dashboard" title="Bookmarks" />
        <EmptyState
          icon={Bookmark}
          title="No Bookmarks Yet"
          description="Start exploring collections and bookmark records to save them here."
          action={
            <Link href="/collection" className="text-brand-gold text-sm hover:text-brand-gold-light">
              Browse Collections
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="Bookmarks" description={`${count} saved records`} />

      <div className="space-y-2">
        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 flex items-center justify-between hover:border-brand-gold/25 transition-colors"
          >
            <BookmarkLink
              collectionSlug={bm.collection_slug}
              recordId={bm.record_id}
              className="flex-1 min-w-0 group text-left"
            >
              <p className="text-sm font-medium text-brand-cream truncate group-hover:text-brand-gold transition-colors">
                {bm.record_title || 'Untitled Record'}
              </p>
              <p className="text-xs text-brand-muted">
                {bm.collection_slug.split('/').pop()} &middot; Saved {formatDate(bm.created_at)}
              </p>
            </BookmarkLink>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <DeleteBookmarkButton bookmarkId={bm.id} />
              <BookmarkLink
                collectionSlug={bm.collection_slug}
                recordId={bm.record_id}
                className="text-brand-muted hover:text-brand-gold"
              >
                <ArrowRight className="w-4 h-4" />
              </BookmarkLink>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          {page > 1 && (
            <Link href={`/dashboard/bookmarks?page=${page - 1}`} className="text-sm text-brand-gold">
              Previous
            </Link>
          )}
          <span className="text-sm text-brand-muted">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/dashboard/bookmarks?page=${page + 1}`} className="text-sm text-brand-gold">
              Next
            </Link>
          )}
        </div>
      )}
    </>
  );
}
