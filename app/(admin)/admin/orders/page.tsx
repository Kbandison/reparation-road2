import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ShoppingCart } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';

export const metadata: Metadata = { title: 'Admin — Orders' };

export default function AdminOrdersPage() {
  return (
    <>
      <PageHeader eyebrow="Admin" title="Orders" />
      <EmptyState
        icon={ShoppingCart}
        title="No Orders Yet"
        description="Order tracking will be available when e-commerce features are activated."
      />
    </>
  );
}
