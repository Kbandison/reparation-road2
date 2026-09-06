import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { NewsletterComposer } from '@/components/admin/newsletter-composer';

export const metadata: Metadata = { title: 'Admin — Newsletter' };

export default function AdminNewsletterPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="The Road Report"
        description="Write and send an issue. The archive fills in what it can."
      />
      <NewsletterComposer />
    </>
  );
}
