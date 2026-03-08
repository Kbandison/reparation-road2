import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AdminBookingsTable } from '@/components/admin/admin-bookings-table';

export const metadata: Metadata = { title: 'Admin — Bookings' };

export default function AdminBookingsPage() {
  return (
    <>
      <PageHeader eyebrow="Admin" title="Bookings" description="Manage consultation bookings" />
      <AdminBookingsTable />
    </>
  );
}
