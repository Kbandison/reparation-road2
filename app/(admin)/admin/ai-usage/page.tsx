import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { AiUsagePanel } from '@/components/admin/ai-usage-panel';

export const metadata: Metadata = { title: 'Admin — AI Usage' };

export default function AdminAiUsagePage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="AI Usage"
        description="What Claude has cost this month across the assistant, transcription and admin tools, and the caps that keep it inside the budget."
      />
      <AiUsagePanel />
    </>
  );
}
