import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { getIssueStats, renderIssueHtml } from '@/lib/newsletter-issue';
import { getRecipients, type NewsletterSegment } from '@/lib/newsletter-segments';
import { NEWSLETTER_FROM, NEWSLETTER_REPLY_TO, unsubscribeUrl } from '@/lib/newsletter';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Resend accepts up to 100 messages per batch call. */
const BATCH_SIZE = 100;

// Sending is the one operation here that scales with the list, so it gets the
// longest runtime the platform allows.
export const maxDuration = 300;

/**
 * Stop sending well before the platform would stop us.
 *
 * Being killed mid-loop is the failure this whole design exists to avoid:
 * nothing after the loop runs, so the issue never leaves 'sending'. Finishing
 * early on our own terms means the final bookkeeping always happens, and what
 * is left simply resumes.
 */
const DEADLINE_MS = 240_000;

/**
 * How long a claim stays valid.
 *
 * A run that died without finishing leaves the issue claimed forever. Past this
 * age the claim is treated as abandoned and can be taken over — which is what
 * makes a stuck issue recoverable rather than permanently wedged.
 */
const STALE_CLAIM_MS = 15 * 60_000;

/**
 * Send an issue — either a test to one address, or the real thing to a segment.
 *
 * Every recipient gets their own rendered copy because the unsubscribe link is
 * signed per address. That rules out one broadcast to a shared audience and
 * makes this a batched personal send instead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const { data: issue } = await supabase
    .from('newsletter_issues')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!issue.subject?.trim()) {
    return NextResponse.json({ error: 'Give the issue a subject first.' }, { status: 400 });
  }

  const stats = await getIssueStats();

  const send = (to: string, html: string) =>
    ({
      from: NEWSLETTER_FROM,
      replyTo: NEWSLETTER_REPLY_TO,
      to: [to],
      subject: issue.subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl(to)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

  /* --- Test send ---------------------------------------------------------- */

  if (typeof body.test === 'string' && body.test.trim()) {
    const to = body.test.trim();
    const html = renderIssueHtml({ ...issue, auto_stats: stats }, { email: to });
    const { error } = await resend.emails.send(send(to, html));

    if (error) {
      console.error('[newsletter] test send failed:', error);
      return NextResponse.json({ error: 'Test send failed' }, { status: 502 });
    }
    // Deliberately does not touch status — a test is not a send.
    return NextResponse.json({ success: true, test: true, to });
  }

  /* --- Real send ---------------------------------------------------------- */

  if (issue.status === 'sent') {
    return NextResponse.json(
      { error: 'This issue has already been sent.' },
      { status: 409 },
    );
  }

  // Claim the issue before doing any work. Two admins pressing send at the same
  // moment would otherwise mail the whole list twice.
  //
  // A claim older than STALE_CLAIM_MS is taken over rather than refused: it
  // belongs to a run that has already been killed, and refusing it is what used
  // to leave an issue wedged with no way forward.
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  const { data: claimed } = await supabase
    .from('newsletter_issues')
    .update({ status: 'sending', sending_started_at: now.toISOString() })
    .eq('id', id)
    .or(`status.eq.draft,and(status.eq.sending,sending_started_at.lt.${staleBefore})`)
    .select('id')
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json(
      { error: 'This issue is already being sent. Try again in a few minutes.' },
      { status: 409 },
    );
  }

  const segment = (issue.segment || 'all') as NewsletterSegment;

  let recipients;
  try {
    recipients = await getRecipients(segment);
  } catch (e) {
    await supabase.from('newsletter_issues').update({ status: 'draft' }).eq('id', id);
    console.error('[newsletter] could not build recipient list:', e);
    return NextResponse.json({ error: 'Could not build recipient list' }, { status: 500 });
  }

  if (recipients.length === 0) {
    await supabase
      .from('newsletter_issues')
      .update({ status: 'draft', sending_started_at: null })
      .eq('id', id);
    return NextResponse.json(
      { error: 'That segment has no subscribers.' },
      { status: 400 },
    );
  }

  // Everyone this issue has already reached, from this attempt or an earlier
  // one. Reading it up front is what makes a resumed run skip them.
  const alreadySent = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('newsletter_issue_sends')
      .select('email')
      .eq('issue_id', id)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data) alreadySent.add(row.email.toLowerCase());
    if (data.length < 1000) break;
  }

  const pending = recipients.filter((r) => !alreadySent.has(r.email.toLowerCase()));

  let sent = 0;
  let failed = 0;
  let ranOutOfTime = false;
  const startedAt = Date.now();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      ranOutOfTime = true;
      break;
    }

    const chunk = pending.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((r) =>
      send(r.email, renderIssueHtml({ ...issue, auto_stats: stats }, r)),
    );

    try {
      const { error } = await resend.batch.send(payload);
      if (error) {
        failed += chunk.length;
        console.error(`[newsletter] batch at offset ${i} failed:`, error);
        continue;
      }
    } catch (e) {
      failed += chunk.length;
      console.error(`[newsletter] batch at offset ${i} threw:`, e);
      continue;
    }

    sent += chunk.length;

    // Recorded after the send, not before. A crash in the gap re-sends at most
    // this one batch on resume; recording first would instead mark a hundred
    // people as done who never received anything, and nothing would ever
    // notice.
    const { error: recordError } = await supabase
      .from('newsletter_issue_sends')
      .upsert(
        chunk.map((r) => ({ issue_id: id, email: r.email })),
        { onConflict: 'issue_id,email', ignoreDuplicates: true },
      );

    if (recordError) {
      console.error(`[newsletter] could not record batch at offset ${i}:`, recordError);
    }
  }

  const remaining = pending.length - sent - failed;

  if (ranOutOfTime || remaining > 0) {
    // Left claimed and resumable. The claim is refreshed so a run that is
    // genuinely progressing is not mistaken for an abandoned one.
    await supabase
      .from('newsletter_issues')
      .update({ sending_started_at: new Date().toISOString() })
      .eq('id', id);

    console.log(
      `[newsletter] issue ${id} paused after ${sent} sent, ${remaining} remaining`,
    );

    return NextResponse.json({
      success: true,
      partial: true,
      sent,
      failed,
      remaining,
      total: recipients.length,
    });
  }

  // Complete. recipient_count counts everyone this issue reached across every
  // attempt, not just the last one.
  await supabase
    .from('newsletter_issues')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sending_started_at: null,
      auto_stats: stats,
      recipient_count: alreadySent.size + sent,
      total_records_snapshot: stats.totalRecords,
    })
    .eq('id', id);

  console.log(
    `[newsletter] issue ${id} sent to ${alreadySent.size + sent}/${recipients.length} (${failed} failed)`,
  );

  return NextResponse.json({
    success: true,
    sent: alreadySent.size + sent,
    failed,
    total: recipients.length,
  });
}
