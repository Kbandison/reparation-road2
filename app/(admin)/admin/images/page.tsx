import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ImageUploader } from '@/components/admin/image-uploader';

export const metadata: Metadata = { title: 'Admin — Upload Images' };

export default function AdminImagesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Upload Images"
        description="Upload archival scans straight to Supabase Storage. Large files upload directly and don't hit the request-size limit."
      />
      <ImageUploader />
    </>
  );
}
