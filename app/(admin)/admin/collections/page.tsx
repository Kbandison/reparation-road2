import type { Metadata } from 'next';
import Link from 'next/link';
import { Database } from 'lucide-react';
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
      <Link
        href="/admin/collections/unused-tables"
        className="inline-flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-gold transition-colors -mt-4 mb-6"
      >
        <Database className="w-4 h-4" aria-hidden="true" /> Unused tables
      </Link>
      <AdminCollectionsTable collections={collections} />
    </>
  );
}
