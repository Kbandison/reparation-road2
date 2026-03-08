import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AdminSettingsPanel } from '@/components/admin/admin-settings-panel';

export const metadata: Metadata = { title: 'Admin — Settings' };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Site configuration and platform settings"
      />
      <AdminSettingsPanel />
    </>
  );
}
