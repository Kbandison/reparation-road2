'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Users, Send, MessageSquare, ExternalLink } from 'lucide-react';
import { Avatar } from '@/components/forum/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Confidence = 'strong' | 'probable' | 'possible';

interface SharedPerson {
  individualId: string;
  treeId: string;
  name: string;
  birthYear: number | null;
  birthPlace: string | null;
  theirBirthYear: number | null;
  confidence: Confidence;
}

interface Overlap {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  people: SharedPerson[];
  bestConfidence: Confidence;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const CONFIDENCE: Record<Confidence, { label: string; className: string }> = {
  strong: { label: 'Same birth year', className: 'bg-brand-sage/15 text-brand-sage' },
  probable: { label: 'Close dates', className: 'bg-brand-gold/15 text-brand-gold' },
  possible: { label: 'Name only', className: 'bg-brand-muted/15 text-brand-muted' },
};

export function TreeConnectionsPanel({ currentUserId }: { currentUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [overlaps, setOverlaps] = useState<Overlap[]>([]);
  const [busy, setBusy] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/tree-connections');
    if (!res.ok) return;
    const data = await res.json();
    setSharing(data.sharing);
    setOverlaps(data.overlaps ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function toggleSharing(enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/tree-connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        toast.error('Could not save that');
        return;
      }
      setSharing(enabled);
      await load();
      toast.success(enabled ? 'Tree sharing is on' : 'Tree sharing is off');
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(overlap: Overlap) {
    if (openThread === overlap.userId) {
      setOpenThread(null);
      return;
    }
    setOpenThread(overlap.userId);
    setMessages([]);
    setDraft('');

    const res = await fetch('/api/tree-connections/messages');
    if (!res.ok) return;
    const { conversations } = await res.json();
    const existing = conversations?.find(
      (c: { other: { id: string } }) => c.other.id === overlap.userId,
    );
    if (!existing) return;

    const thread = await fetch(
      `/api/tree-connections/messages?conversation=${existing.id}`,
    );
    if (thread.ok) setMessages((await thread.json()).messages ?? []);
  }

  async function sendMessage(overlap: Overlap) {
    if (!draft.trim()) return;
    setSendingTo(overlap.userId);
    try {
      const res = await fetch('/api/tree-connections/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: overlap.userId,
          body: draft,
          aboutIndividualId: overlap.people[0]?.individualId,
          aboutName: overlap.people[0]?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not send');
        return;
      }
      setMessages((m) => [...m, data.message]);
      setDraft('');
      toast.success('Message sent');
    } finally {
      setSendingTo(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
        <Loader2 className="w-4 h-4 animate-spin text-brand-muted" />
      </div>
    );
  }

  /* ---------------- Opt-in ---------------- */

  if (!sharing) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-brand-gold" />
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            Find researchers with the same people
          </h2>
        </div>
        <p className="text-sm text-brand-muted leading-relaxed">
          Turn on tree sharing to see other Reparation Road researchers who have the
          same people in their trees, and to message them.
        </p>
        {/*
          Stated plainly rather than buried. Sharing covers every individual in
          the tree, living relatives included — someone agreeing to this should
          know that before they click, not afterwards.
        */}
        <p className="text-sm text-brand-muted leading-relaxed mt-3">
          <strong className="text-brand-cream">What gets shared:</strong> the names,
          dates and places of everyone in your trees &mdash; including living
          relatives &mdash; become visible to other researchers whose trees contain
          the same people. Matching is mutual, so you only see others while they can
          also see you. You can switch this off at any time.
        </p>
        <Button
          onClick={() => toggleSharing(true)}
          disabled={busy}
          className="mt-5 bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Turn on tree sharing'}
        </Button>
      </div>
    );
  }

  /* ---------------- Matches ---------------- */

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-gold" />
          <h2 className="font-display text-lg font-semibold text-brand-cream">
            Researchers you overlap with
          </h2>
        </div>
        <button
          onClick={() => toggleSharing(false)}
          disabled={busy}
          className="text-xs text-brand-muted hover:text-brand-cream shrink-0"
        >
          Turn off sharing
        </button>
      </div>

      {overlaps.length === 0 ? (
        <p className="text-sm text-brand-muted leading-relaxed">
          No overlaps yet. As more researchers turn on sharing, anyone whose tree
          contains the same people as yours will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {overlaps.map((o) => (
            <div
              key={o.userId}
              className="border border-brand-gold/[0.08] rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar name={o.displayName} src={o.avatarUrl} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-brand-cream font-medium">
                      {o.displayName}
                    </span>
                    {o.handle && (
                      <Link
                        href={`/forum/u/${o.handle}`}
                        className="text-xs text-brand-gold hover:underline inline-flex items-center gap-1"
                      >
                        @{o.handle} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-brand-muted mt-0.5">
                    {o.people.length} shared{' '}
                    {o.people.length === 1 ? 'person' : 'people'}
                  </p>

                  <ul className="mt-3 space-y-1.5">
                    {o.people.slice(0, 5).map((p) => (
                      <li
                        key={p.individualId}
                        className="flex items-center gap-2 flex-wrap text-sm"
                      >
                        <Link
                          href={`/family-tree/${p.treeId}/person/${p.individualId}`}
                          className="text-brand-cream hover:text-brand-gold"
                        >
                          {p.name}
                        </Link>
                        {p.birthYear && (
                          <span className="text-xs text-brand-muted tabular-nums">
                            b. {p.birthYear}
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${CONFIDENCE[p.confidence].className}`}
                        >
                          {CONFIDENCE[p.confidence].label}
                        </span>
                      </li>
                    ))}
                    {o.people.length > 5 && (
                      <li className="text-xs text-brand-muted">
                        and {o.people.length - 5} more
                      </li>
                    )}
                  </ul>

                  <button
                    onClick={() => openConversation(o)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-brand-gold hover:text-brand-gold-light"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {openThread === o.userId ? 'Hide messages' : 'Message'}
                  </button>

                  {openThread === o.userId && (
                    <div className="mt-3 border-t border-brand-gold/[0.08] pt-3">
                      {messages.length > 0 && (
                        <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                          {messages.map((m) => (
                            <div
                              key={m.id}
                              className={`text-sm rounded-xl px-3 py-2 max-w-[85%] ${
                                m.sender_id === currentUserId
                                  ? 'ml-auto bg-brand-gold/[0.12] text-brand-cream'
                                  : 'bg-brand-bg text-brand-muted'
                              }`}
                            >
                              {m.body}
                            </div>
                          ))}
                        </div>
                      )}
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder={`Tell ${o.displayName} how ${o.people[0]?.name ?? 'this person'} connects to your line.`}
                        className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold resize-y text-sm"
                      />
                      <Button
                        onClick={() => sendMessage(o)}
                        disabled={sendingTo === o.userId || !draft.trim()}
                        className="mt-2 bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
                      >
                        {sendingTo === o.userId ? (
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
          ))}
        </div>
      )}
    </div>
  );
}
