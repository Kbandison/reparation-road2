import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ImageUploader } from '@/components/admin/image-uploader';

export const metadata: Metadata = { title: 'Admin — Upload Images' };

export default async function AdminImagesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('collections')
    .select('slug, name, table_name')
    .not('table_name', 'is', null)
    .order('name');

  const collections = (data || []) as { slug: string; name: string; table_name: string }[];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Upload Images"
        description="Upload archival scans straight to Supabase Storage. Large files upload directly and don't hit the request-size limit. Optionally attach them to records by filename."
      />
      <ImageUploader collections={collections} />
    </>
  );
}
