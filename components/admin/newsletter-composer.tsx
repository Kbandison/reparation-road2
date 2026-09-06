'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Send, Eye, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface IssueSummary {
  id: string;
  subject: string;
  status: 'draft' | 'sending' | 'sent';
  segment: string;
  recipient_count: number | null;
  sent_at: string | null;
  updated_at: string;
}

interface Stats {
  newRecords: number | null;
  totalRecords: number;
  newCollections: { name: string; slug: string; recordCount: number }[];
  since: string | null;
}

interface Sections {
  from_archives?: { title?: string; body?: string; link?: string };
  mystery?: { body?: string; link?: string };
  research_tip?: { title?: string; body?: string };
  updates?: { body?: string };
}

interface Issue extends IssueSummary {
  preview_text: string | null;
  sections: Sections;
}

const SEGMENTS = [
  { value: 'all', label: 'Everyone subscribed' },
  { value: 'members', label: 'Active premium members' },
  { value: 'free_accounts', label: 'Free accounts' },
  { value: 'former_members', label: 'Former members' },
  { value: 'donors', label: 'Donors' },
  { value: 'no_account', label: 'Newsletter-only (no account)' },
];

/**
 * The written half of an issue, described once and rendered generically.
 *
 * Only one section is on screen at a time, so the picker carries a written/empty
 * marker for each — otherwise it is far too easy to send an issue having
 * forgotten a section you never scrolled to.
 */
const SECTIONS: {
  key: keyof Sections;
  label: string;
  hint: string;
  fields: {
    name: string;
    kind: 'input' | 'textarea';
    label: string;
    placeholder: string;
    rows?: number;
  }[];
}[] = [
  {
    key: 'from_archives',
    label: 'From the Archives',
    hint: 'One person, family or document worth slowing down for.',
    fields: [
      { name: 'title', kind: 'input', label: 'Headline', placeholder: 'The Perryman family, twice recorded' },
      { name: 'body', kind: 'textarea', label: 'Body', placeholder: 'Blank line between paragraphs.', rows: 8 },
      { name: 'link', kind: 'input', label: 'Link to the record', placeholder: 'Optional' },
    ],
  },
  {
    key: 'mystery',
    label: 'Can You Help Identify This Person?',
    hint: 'Link a forum thread so answers land somewhere permanent.',
    fields: [
      { name: 'body', kind: 'textarea', label: 'The record, and what you cannot work out', placeholder: 'What it shows, and where it stops.', rows: 6 },
      { name: 'link', kind: 'input', label: 'Forum thread URL', placeholder: 'https://www.reparationroad.org/forum/thread/...' },
    ],
  },
  {
    key: 'research_tip',
    label: 'Research Tip',
    hint: 'A record type, a search technique, a common dead end.',
    fields: [
      { name: 'title', kind: 'input', label: 'Headline', placeholder: 'Reading a Freedmen\u2019s Bureau ration list' },
      { name: 'body', kind: 'textarea', label: 'Body', placeholder: 'One short lesson.', rows: 7 },
    ],
  },
  {
    key: 'updates',
    label: 'Updates',
    hint: 'Site improvements, partnerships, events.',
    fields: [
      { name: 'body', kind: 'textarea', label: 'Body', placeholder: 'What changed since last time.', rows: 6 },
    ],
  },
];

/** A section counts as written once any of its fields has content. */
function isFilled(sections: Sections, key: keyof Sections): boolean {
  const section = sections[key] as Record<string, string> | undefined;
  return Boolean(section && Object.values(section).some((v) => v?.trim()));
}

const card = 'bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6';
const field = 'bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold';

export function NewsletterComposer() {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  // Sending the whole list is irreversible, so it takes two deliberate clicks.
  const [confirmSend, setConfirmSend] = useState(false);
  const [activeSection, setActiveSection] = useState<keyof Sections>('from_archives');

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/newsletter/issues');
    if (!res.ok) {
      toast.error('Could not load issues');
      return;
    }
    const data = await res.json();
    setIssues(data.issues);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    loadList().finally(() => setLoading(false));
  }, [loadList]);

  async function openIssue(id: string) {
    const res = await fetch(`/api/admin/newsletter/issues/${id}`);
    if (!res.ok) {
      toast.error('Could not open that issue');
      return;
    }
    const data = await res.json();
    setIssue(data.issue);
    setStats(data.stats);
    setPreview(data.preview);
    setConfirmSend(false);
    setShowPreview(false);
  }

  async function createDraft() {
    const res = await fetch('/api/admin/newsletter/issues', { method: 'POST' });
    if (!res.ok) {
      toast.error('Could not create a draft');
      return;
    }
    const { issue: created } = await res.json();
    await loadList();
    await openIssue(created.id);
  }

  async function save(patch: Partial<Issue>) {
    if (!issue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/newsletter/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not save');
        return;
      }
      setIssue(data.issue);
      await loadList();
      toast.success('Saved');
    } finally {
      setSaving(false);
    }
  }

  async function refreshPreview() {
    if (!issue) return;
    const res = await fetch(`/api/admin/newsletter/issues/${issue.id}`);
    if (res.ok) {
      const data = await res.json();
      setPreview(data.preview);
      setShowPreview(true);
    }
  }

  async function sendTest() {
    if (!issue || !testEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/newsletter/issues/${issue.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: testEmail.trim() }),
      });
      const data = await res.json();
      toast[res.ok ? 'success' : 'error'](
        res.ok ? `Test sent to ${data.to}` : data.error || 'Test failed',
      );
    } finally {
      setSending(false);
    }
  }

  async function sendIssue() {
    if (!issue) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/newsletter/issues/${issue.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Send failed');
        return;
      }
      toast.success(
        data.failed
          ? `Sent to ${data.sent} of ${data.total} — ${data.failed} failed`
          : `Sent to ${data.sent} subscriber${data.sent === 1 ? '' : 's'}`,
      );
      await loadList();
      await openIssue(issue.id);
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/newsletter/issues/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Could not delete');
      return;
    }
    if (issue?.id === id) setIssue(null);
    await loadList();
    toast.success('Draft deleted');
  }

  function setSection(key: keyof Sections, patch: Record<string, string>) {
    if (!issue) return;
    setIssue({
      ...issue,
      sections: { ...issue.sections, [key]: { ...issue.sections[key], ...patch } },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-brand-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading&hellip;
      </div>
    );
  }

  const sent = issue?.status === 'sent';

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] items-start">
      {/* ---------------- Issues list ---------------- */}
      <div className="space-y-4">
        <Button
          onClick={createDraft}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New issue
        </Button>

        {stats && (
          <div className={card}>
            <h3 className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
              From the archive
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-brand-muted">Total records</dt>
                <dd className="text-brand-cream tabular-nums">
                  {stats.totalRecords.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-muted">New since last issue</dt>
                <dd className="text-brand-cream tabular-nums">
                  {stats.newRecords === null ? '—' : stats.newRecords.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-muted">New collections</dt>
                <dd className="text-brand-cream tabular-nums">
                  {stats.newCollections.length}
                </dd>
              </div>
            </dl>
            {stats.newRecords === null && (
              <p className="text-[11px] text-brand-muted/70 mt-3 leading-relaxed">
                No previous issue to compare against, so the record count is left out
                of the first send rather than announcing the whole archive as new.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {issues.map((i) => (
            <button
              key={i.id}
              onClick={() => openIssue(i.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                issue?.id === i.id
                  ? 'border-brand-gold/40 bg-brand-gold/[0.06]'
                  : 'border-brand-gold/[0.08] hover:border-brand-gold/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-cream truncate">
                  {i.subject || 'Untitled issue'}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider shrink-0 ${
                    i.status === 'sent' ? 'text-brand-sage' : 'text-brand-muted'
                  }`}
                >
                  {i.status}
                </span>
              </div>
              <p className="text-[11px] text-brand-muted mt-1">
                {i.sent_at
                  ? `Sent to ${i.recipient_count ?? 0} · ${new Date(i.sent_at).toLocaleDateString()}`
                  : `Edited ${new Date(i.updated_at).toLocaleDateString()}`}
              </p>
            </button>
          ))}
          {issues.length === 0 && (
            <p className="text-sm text-brand-muted px-1">
              No issues yet. Start one and the archive will fill in what it can.
            </p>
          )}
        </div>
      </div>

      {/* ---------------- Editor ---------------- */}
      {!issue ? (
        <div className={`${card} text-sm text-brand-muted`}>
          Select an issue, or start a new one.
        </div>
      ) : (
        <div className="space-y-6">
          {sent && (
            <div className="rounded-2xl border border-brand-sage/30 bg-brand-sage/[0.07] px-5 py-4">
              <p className="text-sm text-brand-cream flex items-center gap-2">
                <Check className="w-4 h-4 text-brand-sage" />
                Sent to {issue.recipient_count ?? 0} subscribers on{' '}
                {issue.sent_at ? new Date(issue.sent_at).toLocaleString() : ''}.
              </p>
              <p className="text-xs text-brand-muted mt-1">
                Kept as a record of what went out, so it can no longer be edited.
              </p>
            </div>
          )}

          <div className={`${card} space-y-4`}>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={issue.subject}
                disabled={sent}
                onChange={(e) => setIssue({ ...issue, subject: e.target.value })}
                placeholder="Free Persons of Color, and a name we can't place"
                className={field}
              />
            </div>
            <div className="space-y-2">
              <Label>Preview line</Label>
              <Input
                value={issue.preview_text ?? ''}
                disabled={sent}
                onChange={(e) => setIssue({ ...issue, preview_text: e.target.value })}
                placeholder="Shown next to the subject in most inboxes"
                className={field}
              />
            </div>
            <div className="space-y-2">
              <Label>Send to</Label>
              <Select
                value={issue.segment}
                disabled={sent}
                onValueChange={(v) => setIssue({ ...issue, segment: v })}
              >
                <SelectTrigger className={field}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={`${card} space-y-5`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2 flex-1 min-w-[240px]">
                <Label>Section</Label>
                <Select
                  value={activeSection}
                  onValueChange={(v) => setActiveSection(v as keyof Sections)}
                >
                  <SelectTrigger className={field}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((sec) => (
                      <SelectItem key={sec.key} value={sec.key}>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isFilled(issue.sections, sec.key)
                                ? 'bg-brand-sage'
                                : 'bg-brand-muted/40'
                            }`}
                          />
                          {sec.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-brand-muted pb-2">
                {SECTIONS.filter((sec) => isFilled(issue.sections, sec.key)).length} of{' '}
                {SECTIONS.length} written
              </p>
            </div>

            {SECTIONS.filter((sec) => sec.key === activeSection).map((sec) => (
              <div key={sec.key} className="space-y-4 border-t border-brand-gold/[0.08] pt-5">
                <p className="text-xs text-brand-muted">{sec.hint}</p>

                {sec.fields.map((f) => {
                  const current =
                    (issue.sections[sec.key] as Record<string, string> | undefined)?.[f.name] ?? '';
                  return (
                    <div key={f.name} className="space-y-2">
                      <Label>{f.label}</Label>
                      {f.kind === 'textarea' ? (
                        <Textarea
                          value={current}
                          disabled={sent}
                          rows={f.rows}
                          placeholder={f.placeholder}
                          onChange={(e) => setSection(sec.key, { [f.name]: e.target.value })}
                          className={`${field} resize-y`}
                        />
                      ) : (
                        <Input
                          value={current}
                          disabled={sent}
                          placeholder={f.placeholder}
                          onChange={(e) => setSection(sec.key, { [f.name]: e.target.value })}
                          className={field}
                        />
                      )}
                    </div>
                  );
                })}

                <p className="text-[11px] text-brand-muted/70">
                  Sections left empty are omitted from the issue, not rendered blank.
                </p>
              </div>
            ))}
          </div>

          {/* ---------------- Actions ---------------- */}
          <div className={`${card} space-y-4`}>
            <div className="flex flex-wrap gap-3">
              {!sent && (
                <Button
                  onClick={() =>
                    save({
                      subject: issue.subject,
                      preview_text: issue.preview_text ?? '',
                      segment: issue.segment,
                      sections: issue.sections,
                    })
                  }
                  disabled={saving}
                  className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save draft'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={refreshPreview}
                className="border-brand-gold/25 text-brand-cream rounded-xl"
              >
                <Eye className="w-4 h-4 mr-1.5" /> Preview
              </Button>
              {!sent && (
                <Button
                  variant="outline"
                  onClick={() => remove(issue.id)}
                  className="border-brand-burgundy/40 text-brand-burgundy-light rounded-xl ml-auto"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              )}
            </div>

            {!sent && (
              <>
                <div className="border-t border-brand-gold/[0.08] pt-4 space-y-2">
                  <Label>Send a test first</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={field}
                    />
                    <Button
                      variant="outline"
                      onClick={sendTest}
                      disabled={sending || !testEmail.trim()}
                      className="border-brand-gold/25 text-brand-cream rounded-xl shrink-0"
                    >
                      Send test
                    </Button>
                  </div>
                  <p className="text-[11px] text-brand-muted/70">
                    A test doesn&rsquo;t mark the issue as sent. Save first &mdash; the test
                    uses what&rsquo;s stored, not what&rsquo;s on screen.
                  </p>
                </div>

                <div className="border-t border-brand-gold/[0.08] pt-4">
                  {confirmSend ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-brand-cream">
                        Send to{' '}
                        <strong>
                          {SEGMENTS.find((s) => s.value === issue.segment)?.label}
                        </strong>
                        ? This can&rsquo;t be undone.
                      </p>
                      <Button
                        onClick={sendIssue}
                        disabled={sending}
                        className="bg-brand-burgundy text-brand-cream hover:bg-brand-burgundy-light rounded-xl"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Yes, send it'
                        )}
                      </Button>
                      <button
                        onClick={() => setConfirmSend(false)}
                        className="text-xs text-brand-muted hover:text-brand-cream"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setConfirmSend(true)}
                      disabled={!issue.subject.trim()}
                      className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
                    >
                      <Send className="w-4 h-4 mr-1.5" /> Send issue
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {showPreview && (
            <div className={card}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold text-brand-cream">
                  Preview
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-xs text-brand-muted hover:text-brand-cream"
                >
                  Hide
                </button>
              </div>
              <iframe
                title="Newsletter preview"
                srcDoc={preview}
                className="w-full h-[640px] rounded-xl border border-brand-gold/[0.08] bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
