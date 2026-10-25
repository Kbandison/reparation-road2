import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { TranscriptionManager } from '@/components/admin/transcription/transcription-manager';

export const metadata: Metadata = { title: 'Admin — Transcriptions' };

export default function AdminTranscriptionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Transcriptions"
        description="Claude reads each scanned page and writes out its text, so names on the page become searchable. Transcripts appear under the scan, marked as AI transcriptions, and admins can correct them."
      />
      <TranscriptionManager />
    </>
  );
}
