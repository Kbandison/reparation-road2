import { createAdminClient } from '@/lib/supabase/admin';
import { EMAIL, emailShell } from '@/lib/email-theme';
import { POSTAL_ADDRESS, SITE_URL, unsubscribeUrl } from '@/lib/newsletter';

/**
 * Composing an issue of The Road Report.
 *
 * Half of each issue writes itself. "New This Week" and "New Collections" come
 * from the archive, because a number nobody has to count is a number that stays
 * correct — and an issue that is mostly pre-assembled is one that still ships in
 * week nine. The written sections are the half worth a person's time.
 */

export interface IssueSections {
  /** A person, family, document or collection worth slowing down for. */
  from_archives?: { title?: string; body?: string; link?: string };
  /** An unidentified record, pointed at its forum thread. */
  mystery?: { body?: string; link?: string };
  /** One short methodology lesson. */
  research_tip?: { title?: string; body?: string };
  /** Site improvements, partnerships, events. */
  updates?: { body?: string };
}

export interface IssueStats {
  /** Records added since the previous issue. Null when there is no baseline. */
  newRecords: number | null;
  newCollections: { name: string; slug: string; recordCount: number }[];
  totalRecords: number;
  since: string | null;
}

export interface NewsletterIssue {
  id: string;
  subject: string;
  preview_text: string | null;
  status: 'draft' | 'sending' | 'sent';
  sections: IssueSections;
  auto_stats: IssueStats | null;
  segment: string;
  recipient_count: number | null;
  total_records_snapshot: number | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* The generated half                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the automatic sections.
 *
 * Deltas are measured against the last *sent* issue, not a fixed window, so
 * skipping a week reports everything since the last one people actually
 * received rather than silently dropping the gap.
 */
export async function getIssueStats(): Promise<IssueStats> {
  const supabase = createAdminClient();

  const { data: previous } = await supabase
    .from('newsletter_issues')
    .select('sent_at, total_records_snapshot')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // record_count is maintained per collection by the sync-counts job, so the
  // archive total is a sum rather than a scan across every data table.
  const { data: collections } = await supabase
    .from('collections')
    .select('name, slug, record_count, created_at')
    .eq('is_published', true);

  const published = collections ?? [];
  const totalRecords = published.reduce((sum, c) => sum + (c.record_count || 0), 0);

  const since = previous?.sent_at ?? null;

  const newCollections = since
    ? published
        .filter((c) => c.created_at > since)
        .sort((a, b) => (b.record_count || 0) - (a.record_count || 0))
        .map((c) => ({ name: c.name, slug: c.slug, recordCount: c.record_count || 0 }))
    : [];

  // No baseline on the first issue — better to omit the line than to announce
  // the entire archive as though it arrived this week.
  const newRecords =
    previous?.total_records_snapshot != null
      ? Math.max(0, totalRecords - Number(previous.total_records_snapshot))
      : null;

  return { newRecords, newCollections, totalRecords, since };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Turn editor text into HTML.
 *
 * Blank lines become paragraphs and nothing else is interpreted. The input is
 * escaped first: an issue goes to the whole list, so a stray angle bracket in
 * someone's prose must never be able to break the markup around it.
 */
function paragraphs(text: string | undefined, color = EMAIL.text): string {
  if (!text?.trim()) return '';
  return escapeHtml(text.trim())
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="color: ${color}; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">${p.replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
}

function sectionHeading(label: string): string {
  return `<p style="color: ${EMAIL.heading}; font-size: 11px; font-weight: bold; letter-spacing: 0.14em; text-transform: uppercase; margin: 34px 0 10px;">${escapeHtml(label)}</p>`;
}

function rule(): string {
  return `<div style="border-top: 1px solid ${EMAIL.rule}; margin: 26px 0 0;"></div>`;
}

function textLink(href: string, label: string): string {
  return `<a href="${href}" style="color: ${EMAIL.link}; text-decoration: underline;">${escapeHtml(label)}</a>`;
}

/** Render one issue for one recipient. */
export function renderIssueHtml(
  issue: Pick<NewsletterIssue, 'subject' | 'sections'> & { auto_stats: IssueStats | null },
  recipient: { email: string; firstName?: string | null },
): string {
  const s = issue.sections || {};
  const stats = issue.auto_stats;
  const parts: string[] = [];

  parts.push(
    `<p style="color: ${EMAIL.heading}; font-size: 11px; font-weight: bold; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 6px;">The Road Report</p>`,
    `<h1 style="color: ${EMAIL.strong}; font-size: 26px; line-height: 1.25; margin: 0 0 4px;">${escapeHtml(issue.subject)}</h1>`,
  );

  // --- New this week ---
  // Guarded on the archive existing, not on there being something new. Gating
  // this on newRecords made the no-delta branch below unreachable, so the very
  // first issue — the one case that branch was written for — silently shipped
  // with no archive section at all.
  if (stats && stats.totalRecords > 0) {
    // Nothing is "new" without a previous issue to measure against, so the
    // heading changes rather than the section disappearing.
    parts.push(sectionHeading(stats.newRecords ? 'New This Week' : 'The Archive'));

    if (stats.newRecords) {
      parts.push(
        `<p style="color: ${EMAIL.text}; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">
          <strong style="color: ${EMAIL.strong}; font-size: 19px;">${stats.newRecords.toLocaleString('en-US')}</strong>
          new historical records added to the archive, bringing the total to
          ${stats.totalRecords.toLocaleString('en-US')}.
        </p>`,
      );
    } else {
      parts.push(
        `<p style="color: ${EMAIL.text}; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">
          The archive now holds <strong style="color: ${EMAIL.strong};">${stats.totalRecords.toLocaleString('en-US')}</strong> records.
        </p>`,
      );
    }

    if (stats.newCollections.length) {
      parts.push(sectionHeading('New Collections'));
      parts.push(
        `<ul style="color: ${EMAIL.text}; font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0 0 14px;">` +
          stats.newCollections
            .map(
              (c) =>
                `<li>${textLink(`${SITE_URL}/collection/${c.slug}`, c.name)}` +
                (c.recordCount
                  ? ` <span style="color: ${EMAIL.muted};">&mdash; ${c.recordCount.toLocaleString('en-US')} records</span>`
                  : '') +
                `</li>`,
            )
            .join('') +
          `</ul>`,
      );
    }
    parts.push(rule());
  }

  // --- From the archives ---
  if (s.from_archives?.body?.trim()) {
    parts.push(sectionHeading('From the Archives'));
    if (s.from_archives.title?.trim()) {
      parts.push(
        `<h2 style="color: ${EMAIL.strong}; font-size: 19px; line-height: 1.3; margin: 0 0 10px;">${escapeHtml(s.from_archives.title)}</h2>`,
      );
    }
    parts.push(paragraphs(s.from_archives.body));
    if (s.from_archives.link?.trim()) {
      parts.push(
        `<p style="margin: 0 0 14px;">${textLink(s.from_archives.link, 'Read the record')}</p>`,
      );
    }
    parts.push(rule());
  }

  // --- Can you help identify this person? ---
  if (s.mystery?.body?.trim()) {
    parts.push(sectionHeading('Can You Help Identify This Person?'));
    parts.push(paragraphs(s.mystery.body));
    if (s.mystery.link?.trim()) {
      // Points at a forum thread, so answers land somewhere permanent and
      // public rather than dying in a reply to this email.
      parts.push(
        `<p style="margin: 0 0 14px;">${textLink(s.mystery.link, 'Share what you know in the forum')}</p>`,
      );
    }
    parts.push(rule());
  }

  // --- Research tip ---
  if (s.research_tip?.body?.trim()) {
    parts.push(sectionHeading('Research Tip'));
    if (s.research_tip.title?.trim()) {
      parts.push(
        `<h2 style="color: ${EMAIL.strong}; font-size: 19px; line-height: 1.3; margin: 0 0 10px;">${escapeHtml(s.research_tip.title)}</h2>`,
      );
    }
    parts.push(paragraphs(s.research_tip.body));
    parts.push(rule());
  }

  // --- Updates ---
  if (s.updates?.body?.trim()) {
    parts.push(sectionHeading('Reparation Road Updates'));
    parts.push(paragraphs(s.updates.body));
    parts.push(rule());
  }

  // --- Research services ---
  parts.push(sectionHeading('Research Services'));
  parts.push(
    `<p style="color: ${EMAIL.text}; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">
      Stuck on a line you cannot get past? We take on individual family research.
      ${textLink(`${SITE_URL}/booking`, 'Book a session')}.
    </p>`,
  );

  const footer = `
    <p style="color: ${EMAIL.muted}; font-size: 12px; margin: 0 0 12px;">
      &mdash; The Reparation Road Team<br/>
      <a href="${SITE_URL}" style="color: ${EMAIL.link}; text-decoration: none;">reparationroad.org</a>
    </p>
    <p style="color: ${EMAIL.faint}; font-size: 11px; line-height: 1.6; margin: 0;">
      You are receiving The Road Report because you subscribed at reparationroad.org.<br/>
      <a href="${unsubscribeUrl(recipient.email)}" style="color: ${EMAIL.faint};">Unsubscribe</a>
      &nbsp;·&nbsp; ${POSTAL_ADDRESS}
    </p>
  `;

  return emailShell(parts.join('\n'), footer);
}
