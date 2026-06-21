'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, LogIn } from 'lucide-react';

interface ReplyEditorProps {
  threadId: string;
  isLoggedIn?: boolean;
}

export function ReplyEditor({ threadId, isLoggedIn = false }: ReplyEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!isLoggedIn) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 text-center">
        <p className="text-sm text-brand-muted mb-4">Sign in to join the conversation.</p>
        <Link href="/login?redirect=/forum">
          <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            <LogIn className="w-4 h-4 mr-2" />
            Sign In to Reply
          </Button>
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      // Routed through the API so the reply also fans out notifications to the
      // thread author, followers, and @mentioned users.
      const res = await fetch('/api/forum/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, content: content.trim() }),
      });
      if (!res.ok) {
        toast.error('Failed to post reply');
      } else {
        setContent('');
        toast.success('Reply posted');
        router.refresh();
      }
    } catch {
      toast.error('Failed to post reply');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-brand-cream mb-4">Reply</h3>
      <Textarea
        placeholder="Write your reply..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold mb-4 resize-none"
      />
      <Button
        type="submit"
        disabled={loading || !content.trim()}
        className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post Reply'}
      </Button>
    </form>
  );
}
