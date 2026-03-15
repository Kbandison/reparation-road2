import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { AdminRelatedRecordsManager } from '@/components/admin/admin-related-records-manager';
import type { Collection } from '@/lib/types';

export const metadata: Metadata = { title: 'Admin — Related Records' };

export default async function AdminRelatedRecordsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('collections')
    .select('slug, name, table_name')
    .eq('is_published', true)
    .not('table_name', 'is', null)
    .order('name');

  const collections = (data || []) as Pick<Collection, 'slug' | 'name' | 'table_name'>[];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Related Records" />
      <AdminRelatedRecordsManager collections={collections} />
    </>
  );
}
