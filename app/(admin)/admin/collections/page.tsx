import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { AdminCollectionsTable } from '@/components/admin/admin-collections-table';
import type { Collection } from '@/lib/types';

export const metadata: Metadata = { title: 'Admin — Collections' };

export default async function AdminCollectionsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('collections')
    .select('*')
    .order('sort_order');

  const collections = (data || []) as Collection[];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Collections" />
      <AdminCollectionsTable collections={collections} />
    </>
  );
}
