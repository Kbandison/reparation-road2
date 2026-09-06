import { Resend } from 'resend';
import {
  EMAIL,
  emailButton,
  emailShell,
  emailSignoff,
} from '@/lib/email-theme';
import {
  NEWSLETTER_FROM,
  NEWSLETTER_REPLY_TO,
  POSTAL_ADDRESS,
  SITE_URL,
  confirmUrl,
  unsubscribeUrl,
} from '@/lib/newsletter';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Newsletter email templates.
 *
 * Kept separate from lib/email.ts on purpose: those are transactional messages
 * that go out from noreply@reparationroad.org regardless of marketing consent.
 * Everything here is marketing mail — it sends from the newsletter subdomain,
 * carries an unsubscribe link, and carries a postal address.
 */

/** Footer for anything sent to a confirmed subscriber. */
function marketingFooter(email: string): string {
  return `
    ${emailSignoff(SITE_URL)}
    <p style="color: ${EMAIL.faint}; font-size: 11px; line-height: 1.6; margin: 12px 0 0;">
      You are receiving The Road Report because you subscribed at reparationroad.org.<br/>
      <a href="${unsubscribeUrl(email)}" style="color: ${EMAIL.faint};">Unsubscribe</a>
      &nbsp;·&nbsp; ${POSTAL_ADDRESS}
    </p>
  `;
}

async function send(label: string, opts: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error(`[newsletter:${label}] RESEND_API_KEY is not set — email not sent`);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: NEWSLETTER_FROM,
      replyTo: NEWSLETTER_REPLY_TO,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      headers: opts.headers,
    });
    if (error) {
      console.error(`[newsletter:${label}] Resend error sending to ${opts.to}:`, error);
      return { ok: false, error: (error as { message?: string }).message || 'send failed' };
    }
    console.log(`[newsletter:${label}] sent to ${opts.to}${data?.id ? ` (id ${data.id})` : ''}`);
    return { ok: true };
  } catch (e) {
    console.error(`[newsletter:${label}] threw sending to ${opts.to}:`, e);
    return { ok: false, error: e instanceof Error ? e.message : 'send threw' };
  }
}

/**
 * Double opt-in confirmation, for footer signups only.
 *
 * This is the one message that goes to an unconfirmed address, so it contains
 * nothing but the confirmation request — no newsletter content, no promotion.
 */
export function sendConfirmationEmail(email: string, token: string) {
  const link = confirmUrl(token);
  return send('confirm', {
    to: email,
    subject: 'Confirm your subscription to The Road Report',
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">One More Step</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Confirm your email to start receiving The Road Report.</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Someone &mdash; we hope you &mdash; asked to receive The Road Report, our newsletter about the records
          we uncover and publish at Reparation Road. Click below to confirm.
        </p>
        ${emailButton(link, 'Confirm Subscription')}
        <p style="color: ${EMAIL.muted}; font-size: 12px; line-height: 1.6;">
          If you didn&rsquo;t request this, ignore this email and nothing further will be sent.
        </p>
      `,
      `
        ${emailSignoff(SITE_URL)}
        <p style="color: ${EMAIL.faint}; font-size: 11px; margin: 10px 0 0;">${POSTAL_ADDRESS}</p>
      `,
    ),
  });
}

/** Sent once a subscription is live — the first email in the welcome sequence. */
export function sendNewsletterWelcomeEmail(email: string, firstName?: string | null) {
  return send('welcome', {
    to: email,
    subject: 'Welcome to The Road Report',
    // Resend surfaces this as a native unsubscribe control in Gmail and Apple
    // Mail, which meaningfully reduces spam complaints.
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Welcome to The Road Report</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Notes from the archive, sent as we uncover them.</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${firstName || 'there'},</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Thank you for subscribing. Each issue brings you what we&rsquo;ve added to the archive, a record
          worth slowing down for, a research tip, and at least one person we still haven&rsquo;t been able
          to identify &mdash; where your eyes might succeed where ours haven&rsquo;t.
        </p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          While you wait for the first issue, there are already thousands of records to search.
        </p>
        ${emailButton(`${SITE_URL}/collection`, 'Browse the Collections')}
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Reply to this email any time. If you have family records of your own, we would genuinely like to see them.
        </p>
      `,
      marketingFooter(email),
    ),
  });
}
