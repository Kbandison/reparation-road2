import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ImportWizard } from '@/components/admin/import-wizard';
import type { Collection } from '@/lib/types';

export const metadata: Metadata = { title: 'Admin — Import Records' };

export default async function AdminImportPage() {
  const supabase = await createClient();

  // Get all collections for the dropdown
  const { data } = await supabase
    .from('collections')
    .select('slug, name, table_name, parent_slug, display_columns, search_columns, has_images, has_ocr, discriminator_column, discriminator_value')
    .order('name');

  const collections = (data || []) as Pick<Collection, 'slug' | 'name' | 'table_name' | 'parent_slug' | 'display_columns' | 'search_columns' | 'has_images' | 'has_ocr' | 'discriminator_column' | 'discriminator_value'>[];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Import Records" />
      <ImportWizard collections={collections} />
    </>
  );
}
