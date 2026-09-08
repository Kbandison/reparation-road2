'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Users, Send, ExternalLink } from 'lucide-react';
import { Avatar } from '@/components/forum/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Researcher {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  people: { confidence: 'strong' | 'probable' | 'possible'; nameFrequency: number }[];
}

/**
 * Other researchers who hold this same person.
 *
 * The canvas badge says how many; this is where you find out who and say
 * something to them. Renders nothing at all when there are no matches — an
 * empty "no connections" card on every person in a 1,400-person tree would be
 * pure noise.
 */
export function PersonConnections({
  individualId,
  personName,
}: {
  individualId: string;
  personName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tree-connections/person/${individualId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setResearchers(data.researchers ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [individualId]);

  async function send(researcher: Researcher) {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/tree-connections/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: researcher.userId,
          body: draft,
          aboutIndividualId: individualId,
          aboutName: personName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not send');
        return;
      }
      setDraft('');
      setOpenFor(null);
      toast.success(`Message sent to ${researcher.displayName}`);
    } finally {
      setSending(false);
    }
  }

  if (loading || researchers.length === 0) return null;

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mt-6">
      <h2 className="font-display text-lg font-semibold text-brand-cream mb-1 inline-flex items-center gap-2">
        <Users className="w-4 h-4 text-brand-gold" />
        Also researched by
      </h2>
      <p className="text-xs text-brand-muted mb-4">
        {researchers.length} other{' '}
        {researchers.length === 1 ? 'researcher has' : 'researchers have'}{' '}
        {personName} in their tree.
      </p>

      <div className="space-y-3">
        {researchers.map((r) => {
          const match = r.people[0];
          return (
            <div key={r.userId} className="border border-brand-gold/[0.08] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Avatar name={r.displayName} src={r.avatarUrl} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-brand-cream font-medium">
                      {r.displayName}
                    </span>
                    {r.handle && (
                      <Link
                        href={`/forum/u/${r.handle}`}
                        className="text-xs text-brand-gold hover:underline inline-flex items-center gap-1"
                      >
                        @{r.handle} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {match?.nameFrequency <= 3 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-burgundy/20 text-brand-burgundy-light">
                        Rare name
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setOpenFor(openFor === r.userId ? null : r.userId)}
                    className="mt-2 text-xs text-brand-gold hover:text-brand-gold-light"
                  >
                    {openFor === r.userId ? 'Cancel' : 'Send a message'}
                  </button>

                  {openFor === r.userId && (
                    <div className="mt-3">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder={`How does ${personName} connect to your line?`}
                        className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold resize-y text-sm"
                      />
                      <Button
                        onClick={() => send(r)}
                        disabled={sending || !draft.trim()}
                        className="mt-2 bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <><Send className="w-3.5 h-3.5 mr-1.5" /> Send</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
