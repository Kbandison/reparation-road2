import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ImageUploader } from '@/components/admin/image-uploader';
import { getImportCollections } from '@/lib/collections/queries';

export const metadata: Metadata = { title: 'Admin — Upload Images' };

export default async function AdminImagesPage() {
  const supabase = await createClient();
  const collections = await getImportCollections(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Upload Images"
        description="Organize storage into buckets and folders, upload scans straight into the open folder, then link them to records or import their records from a spreadsheet."
      />
      <ImageUploader collections={collections} />
    </>
  );
}
