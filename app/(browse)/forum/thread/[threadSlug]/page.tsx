import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ThreadView } from '@/components/forum/thread-view';

interface Props {
  params: Promise<{ threadSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { threadSlug } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from('forum_threads')
    .select('title')
    .eq('slug', threadSlug)
    .single();
  return { title: thread?.title || 'Thread' };
}

export default async function ThreadPage({ params }: Props) {
  const { threadSlug } = await params;
  return <ThreadView slug={threadSlug} />;
}
