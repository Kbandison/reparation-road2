import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AdminUsersTable } from '@/components/admin/admin-users-table';

export const metadata: Metadata = { title: 'Admin — Users' };

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description="Manage users, memberships, and admin access" />
      <AdminUsersTable />
    </>
  );
}
