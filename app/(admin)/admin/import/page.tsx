import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ImportWizard } from '@/components/admin/import-wizard';
import { getImportCollections } from '@/lib/collections/queries';

export const metadata: Metadata = { title: 'Admin — Import Records' };

export default async function AdminImportPage() {
  const supabase = await createClient();
  const collections = await getImportCollections(supabase);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Import Records" />
      <ImportWizard collections={collections} />
    </>
  );
}
