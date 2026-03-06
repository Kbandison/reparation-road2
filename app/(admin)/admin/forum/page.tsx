'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Pin, Lock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Thread {
  id: string;
  title: string;
  slug: string;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  user_id: string;
  author_name: string;
}

export default function AdminForumPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchThreads() {
      const supabase = createClient();

      // Fetch threads without profile join — the join can fail silently
      // with RLS on the client side and return null for the entire result
      const { data: rawThreads, error } = await supabase
        .from('forum_threads')
        .select('id, title, slug, is_pinned, is_locked, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching threads:', error);
        setLoading(false);
        return;
      }

      if (!rawThreads || rawThreads.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      // Fetch profiles separately
      const userIds = [...new Set(rawThreads.map((t) => t.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);

      const profilesMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
        }
      }

      const threadsWithAuthors: Thread[] = rawThreads.map((t) => {
        const profile = profilesMap[t.user_id];
        const authorName = profile
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown';
        return { ...t, author_name: authorName };
      });

      setThreads(threadsWithAuthors);
      setLoading(false);
    }

    fetchThreads();
  }, []);

  async function togglePin(id: string, current: boolean) {
    const supabase = createClient();
    await supabase.from('forum_threads').update({ is_pinned: !current }).eq('id', id);
    setThreads(threads.map((t) => (t.id === id ? { ...t, is_pinned: !current } : t)));
    toast.success(current ? 'Unpinned' : 'Pinned');
  }

  async function toggleLock(id: string, current: boolean) {
    const supabase = createClient();
    await supabase.from('forum_threads').update({ is_locked: !current }).eq('id', id);
    setThreads(threads.map((t) => (t.id === id ? { ...t, is_locked: !current } : t)));
    toast.success(current ? 'Unlocked' : 'Locked');
  }

  async function deleteThread(id: string) {
    const supabase = createClient();
    await supabase.from('forum_threads').delete().eq('id', id);
    setThreads(threads.filter((t) => t.id !== id));
    toast.success('Thread deleted');
  }

  return (
    <>
      <PageHeader eyebrow="Admin" title="Forum Moderation" />

      {loading && <p className="text-sm text-brand-muted">Loading threads...</p>}
      {!loading && threads.length === 0 && <p className="text-sm text-brand-muted">No threads found.</p>}
      <div className="space-y-2">
        {threads.map((thread) => (
          <div key={thread.id} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {thread.is_pinned && <Pin className="w-3.5 h-3.5 text-brand-gold" />}
                {thread.is_locked && <Lock className="w-3.5 h-3.5 text-brand-muted" />}
                <p className="text-sm font-medium text-brand-cream truncate">{thread.title}</p>
              </div>
              <p className="text-xs text-brand-muted">
                {thread.author_name} &middot;{' '}
                {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => togglePin(thread.id, thread.is_pinned)}
                className={`h-8 w-8 ${thread.is_pinned ? 'text-brand-gold' : 'text-brand-muted'}`}
                title={thread.is_pinned ? 'Unpin' : 'Pin'}
              >
                <Pin className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleLock(thread.id, thread.is_locked)}
                className={`h-8 w-8 ${thread.is_locked ? 'text-brand-burgundy-light' : 'text-brand-muted'}`}
                title={thread.is_locked ? 'Unlock' : 'Lock'}
              >
                <Lock className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteThread(thread.id)}
                className="h-8 w-8 text-brand-muted hover:text-brand-burgundy-light"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
