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

/**
 * Step 2 — sent a couple of days in.
 *
 * The welcome said what The Road Report is. This one is about the archive
 * itself, because someone who has searched it once is far likelier to still be
 * reading in a month than someone who has only received email.
 */
export function sendGettingStartedEmail(email: string, firstName?: string | null) {
  return send('sequence-2', {
    to: email,
    subject: 'Getting started with the archive',
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Where to Start</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Four ways into the archive.</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${firstName || 'there'},</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Most people arrive with one name and no idea where it leads. That is the
          right place to begin &mdash; here is how to make the archive give it up.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 26px 0 8px;">Search a surname on its own first</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin: 0 0 18px;">
          Given names were recorded inconsistently and spelled by ear. A surname
          alone returns more, and the extra results are often the useful ones.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 0 0 8px;">Browse by place, not just by name</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin: 0 0 18px;">
          Families stayed put more often than they moved. A county with one
          confirmed ancestor is usually holding several more.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 0 0 8px;">Read the whole document, not the index entry</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin: 0 0 18px;">
          Names of neighbours, witnesses and employers sit in the margins of these
          records. Those margins are frequently where a line continues.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 0 0 8px;">Bookmark as you go</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin: 0 0 18px;">
          A record you cannot place today often makes sense three records later.
          Saved ones are waiting on your dashboard.
        </p>

        ${emailButton(`${SITE_URL}/search`, 'Search the archive')}

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Stuck on a particular line? Reply to this email &mdash; a real person reads it.
        </p>
      `,
      marketingFooter(email),
    ),
  });
}

/**
 * Step 3 — sent about a week in.
 *
 * Why the work exists and how to take part. Deliberately last: it asks for
 * something, and asking before the archive has proved useful is how a list
 * teaches people to ignore it.
 */
export function sendWhatWereBuildingEmail(email: string, firstName?: string | null) {
  return send('sequence-3', {
    to: email,
    subject: 'What we’re building at Reparation Road',
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">What We&rsquo;re Building</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">And how you can be part of it.</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${firstName || 'there'},</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Records of Black families in America were kept unevenly, stored carelessly,
          and in many cases deliberately destroyed. What survives is scattered across
          county courthouses, church basements and private collections &mdash; findable
          in theory, unreachable in practice for most families.
        </p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Reparation Road exists to change that. Every record we digitise, transcribe
          and publish is one more family able to trace a line that was meant to be
          untraceable.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 26px 0 12px;">Three ways to take part</p>
        <ul style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.8; padding-left: 20px;">
          <li><strong style="color: ${EMAIL.strong};">Join the forum.</strong> Other researchers are working the same counties and surnames you are.</li>
          <li><strong style="color: ${EMAIL.strong};">Build your family tree.</strong> Import a GEDCOM or start from one name, and we will match it against the archive as it grows.</li>
          <li><strong style="color: ${EMAIL.strong};">Become a member.</strong> Membership funds the digitisation directly &mdash; more records, sooner.</li>
        </ul>

        ${emailButton(`${SITE_URL}/about`, 'Read our story')}

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          And if your family holds documents, photographs or Bibles that belong in an
          archive like this one, we would genuinely like to hear from you. Just reply.
        </p>
      `,
      marketingFooter(email),
    ),
  });
}
