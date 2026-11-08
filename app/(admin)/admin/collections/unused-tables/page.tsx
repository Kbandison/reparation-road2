import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { UnusedTablesList } from '@/components/admin/unused-tables-list';

export const metadata: Metadata = { title: 'Admin — Unused tables' };

export default function UnusedTablesPage() {
  return (
    <>
      <Link
        href="/admin/collections"
        className="inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-gold transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> Collections
      </Link>
      <PageHeader
        eyebrow="Admin"
        title="Unused tables"
        description="Records tables no collection uses: left behind when a collection was deleted without its table, or kept as legacy and backup copies during earlier reorganizations."
      />
      <UnusedTablesList />
    </>
  );
}
