import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AssistantPageShell } from '@/components/assistant/assistant-page-shell';
import type { UIMessage } from 'ai';

export const metadata: Metadata = {
  title: 'Research Assistant',
};

interface Props {
  searchParams: Promise<{ t?: string }>;
}

export default async function AssistantPage({ searchParams }: Props) {
  const { t } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Threads list — used for the sidebar
  const { data: threads } = await supabase
    .from('assistant_threads')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  const allThreads = (threads ?? []) as Array<{
    id: string;
    title: string;
    updated_at: string;
  }>;

  // Decide the active thread:
  //   - explicit `?t=<id>` wins
  //   - else the most recently updated thread
  //   - else a fresh UUID for a not-yet-saved conversation
  let activeId = t;
  if (!activeId) {
    if (allThreads.length > 0) {
      redirect(`/assistant?t=${allThreads[0].id}`);
    }
    activeId = randomUUID();
    redirect(`/assistant?t=${activeId}`);
  }

  // Load the active thread's messages (admin client so the thread row check
  // happens in a single round-trip; manually verify ownership).
  const admin = createAdminClient();
  const { data: threadRow } = await admin
    .from('assistant_threads')
    .select('id, user_id, title')
    .eq('id', activeId)
    .maybeSingle();

  let initialMessages: UIMessage[] = [];
  let activeTitle = 'New conversation';
  let activeExists = false;
  if (threadRow && threadRow.user_id === user.id) {
    activeExists = true;
    activeTitle = threadRow.title;
    const { data: rows } = await admin
      .from('assistant_messages')
      .select('id, role, content, parts, created_at')
      .eq('thread_id', activeId)
      .order('created_at', { ascending: true });
    initialMessages = (rows ?? []).map((m) => ({
      id: m.id as string,
      role: m.role as UIMessage['role'],
      parts:
        (m.parts as UIMessage['parts']) ??
        [{ type: 'text', text: (m.content as string) ?? '' }],
    }));
  }

  return (
    <AssistantPageShell
      threads={allThreads}
      activeThreadId={activeId}
      activeTitle={activeTitle}
      activeExists={activeExists}
      initialMessages={initialMessages}
    />
  );
}
