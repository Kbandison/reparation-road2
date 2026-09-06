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
  const { data: claimed } = await supabase
    .from('newsletter_issues')
    .update({ status: 'sending' })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json(
      { error: 'This issue is already being sent.' },
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
    await supabase.from('newsletter_issues').update({ status: 'draft' }).eq('id', id);
    return NextResponse.json(
      { error: 'That segment has no subscribers.' },
      { status: 400 },
    );
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((r) =>
      send(r.email, renderIssueHtml({ ...issue, auto_stats: stats }, r)),
    );

    try {
      const { error } = await resend.batch.send(payload);
      if (error) {
        failed += chunk.length;
        console.error(`[newsletter] batch at offset ${i} failed:`, error);
      } else {
        sent += chunk.length;
      }
    } catch (e) {
      failed += chunk.length;
      console.error(`[newsletter] batch at offset ${i} threw:`, e);
    }
  }

  // Marked sent even with partial failures: some subscribers already have it,
  // so re-running would double-send them. The counts record what happened.
  await supabase
    .from('newsletter_issues')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      auto_stats: stats,
      recipient_count: sent,
      total_records_snapshot: stats.totalRecords,
    })
    .eq('id', id);

  console.log(
    `[newsletter] issue ${id} sent to ${sent}/${recipients.length} (${failed} failed)`,
  );

  return NextResponse.json({ success: true, sent, failed, total: recipients.length });
}
