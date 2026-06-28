import Link from 'next/link';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { PostComposer } from '@/components/forum/post-composer';

export const metadata: Metadata = { title: 'Create a post' };

export default function NewThreadPage() {
  return (
    <>
      <div className="mb-2">
        <Link href="/forum" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
          &larr; Back to Feed
        </Link>
      </div>

      <PageHeader title="Create a post" />

      <div className="max-w-2xl">
        <PostComposer />
      </div>
    </>
  );
}
