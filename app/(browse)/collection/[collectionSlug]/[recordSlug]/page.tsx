import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCollectionBySlug, getRecordBySlug, getRelatedRecords } from '@/lib/collections/queries';
import { checkCollectionAccess } from '@/lib/collections/access';
import { getRecordTitle } from '@/lib/collections/helpers';
import { RecordDetailFields } from '@/components/collection/record-detail-fields';
import { ImageViewer } from '@/components/collection/image-viewer';
import { OcrDisplay } from '@/components/collection/ocr-display';
import { BookmarkButton } from '@/components/collection/bookmark-button';
import { RelatedRecords } from '@/components/collection/related-records';
import { AccessGate } from '@/components/collection/access-gate';
import { ActivityTracker } from '@/components/collection/activity-tracker';

interface Props {
  params: Promise<{ collectionSlug: string; recordSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collectionSlug, recordSlug } = await params;
  const supabase = await createClient();
  const collection = await getCollectionBySlug(supabase, collectionSlug);
  if (!collection) return { title: 'Record Not Found' };
  const record = await getRecordBySlug(supabase, collection, recordSlug);
  if (!record) return { title: 'Record Not Found' };
  const title = getRecordTitle(record, collection.display_columns);
  return { title: `${title} — ${collection.name}` };
}

export default async function RecordDetailPage({ params }: Props) {
  const { collectionSlug, recordSlug } = await params;
  const supabase = await createClient();

  const collection = await getCollectionBySlug(supabase, collectionSlug);
  if (!collection) notFound();

  // Check access before querying record data
  const access = await checkCollectionAccess(supabase, collection);

  if (!access.hasAccess) {
    return (
      <>
        <div className="mb-2">
          <Link href={`/collection/${collectionSlug}`} className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
            &larr; {collection.name}
          </Link>
        </div>
        <AccessGate collection={collection} reason={access.reason!} />
      </>
    );
  }

  const record = await getRecordBySlug(supabase, collection, recordSlug);
  if (!record) notFound();

  const recordTitle = getRecordTitle(record, collection.display_columns);

  const relatedRecords = collection.table_name
    ? await getRelatedRecords(supabase, record.id, collection.table_name)
    : [];

  const imagePath = (record.image_url as string) || (record.image_path as string);

  return (
    <>
      <ActivityTracker
        type="record"
        slug={record.slug || record.id}
        name={recordTitle}
        collectionSlug={collectionSlug}
        collectionName={collection.name}
      />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-brand-muted mb-6">
        <Link href="/collection" className="hover:text-brand-gold transition-colors">
          Collections
        </Link>
        <span>/</span>
        <Link href={`/collection/${collectionSlug}`} className="hover:text-brand-gold transition-colors">
          {collection.name}
        </Link>
        <span>/</span>
        <span className="text-brand-cream truncate">{recordTitle}</span>
      </div>

      {/* Title + Bookmark */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-brand-cream">
          {recordTitle}
        </h1>
        <BookmarkButton
          collectionSlug={collectionSlug}
          recordId={record.slug || record.id}
          recordTitle={recordTitle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Image */}
          {collection.has_images && imagePath && (
            <ImageViewer imagePath={imagePath} alt={recordTitle} />
          )}

          {/* Fields */}
          <RecordDetailFields record={record} />

          {/* OCR */}
          {collection.has_ocr && record.ocr_text && (
            <OcrDisplay text={record.ocr_text} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <RelatedRecords records={relatedRecords} currentRecordId={record.id} />
        </div>
      </div>
    </>
  );
}
