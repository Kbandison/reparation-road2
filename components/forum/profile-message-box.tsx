'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Message a researcher from their own profile.
 *
 * Previously this was a link to the dashboard, which meant arriving somewhere
 * else and hunting for the person you were just looking at. The composer
 * belongs where the decision to write is made.
 */
export function ProfileMessageBox({
  toUserId,
  toName,
  aboutName,
}: {
  toUserId: string;
  toName: string;
  /** A person you both hold, used to open the conversation with context. */
  aboutName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/tree-connections/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, body: draft, aboutName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not send');
        return;
      }
      setDraft('');
      setOpen(false);
      setSent(true);
      toast.success(`Message sent to ${toName}`);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-3 text-xs text-brand-sage">
        Message sent. {toName} will see it in their notifications, and replies
        appear on your dashboard.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-gold hover:text-brand-gold-light"
      >
        <MessageSquare className="w-3.5 h-3.5" /> Message {toName}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        autoFocus
        placeholder={
          aboutName
            ? `How does ${aboutName} connect to your line?`
            : `Say hello to ${toName}.`
        }
        className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold resize-y text-sm"
      />
      <div className="flex items-center gap-2 mt-2">
        <Button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <><Send className="w-3.5 h-3.5 mr-1.5" /> Send</>
          )}
        </Button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-brand-muted hover:text-brand-cream"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
