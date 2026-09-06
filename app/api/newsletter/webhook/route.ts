import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { normalizeEmail, unsubscribeEmail } from '@/lib/newsletter';

/**
 * Resend → Reparation Road. The return half of the sync.
 *
 * Unsubscribes happen inside the inbox: the reader clicks a link in the email
 * and the event lands at Resend, not here. Without this route the member record
 * keeps showing them as subscribed, and — worse — the reconcile job pushes them
 * back into the audience on its next run, re-subscribing someone who explicitly
 * opted out.
 *
 * Point a Resend webhook at /api/newsletter/webhook and subscribe it to
 * contact.updated, contact.deleted, email.bounced and email.complained.
 */

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify the Svix signature Resend sends.
 *
 * Done by hand rather than with the svix package — it is a single HMAC and the
 * dependency is not worth carrying for one route.
 */
function verifySignature(
  payload: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');

  if (!id || !timestamp || !signatureHeader) return false;

  // Reject replays of an old, correctly-signed request.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  // The header carries a space-separated list so secrets can be rotated
  // without dropping deliveries mid-rotation.
  return signatureHeader.split(' ').some((entry) => {
    const signature = entry.split(',')[1];
    if (!signature) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

interface ResendWebhookEvent {
  type?: string;
  data?: {
    email?: string;
    to?: string[] | string;
    unsubscribed?: boolean;
    bounce?: { type?: string; subType?: string };
  };
}

function emailsFrom(event: ResendWebhookEvent): string[] {
  const data = event.data || {};
  const found: string[] = [];
  if (data.email) found.push(data.email);
  if (Array.isArray(data.to)) found.push(...data.to);
  else if (typeof data.to === 'string') found.push(data.to);
  return [...new Set(found.map(normalizeEmail).filter(Boolean))];
}

export async function POST(request: Request) {
  const payload = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[newsletter:webhook] RESEND_WEBHOOK_SECRET is not set — rejecting');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (!verifySignature(payload, request.headers, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const emails = emailsFrom(event);
  if (emails.length === 0) {
    return NextResponse.json({ received: true, handled: false });
  }

  let handled = false;

  switch (event.type) {
    case 'contact.updated': {
      // Only the unsubscribe transition matters here. A name change or a
      // re-subscribe made in the Resend dashboard is not consent we can
      // evidence, so it does not flow back into the member record.
      if (event.data?.unsubscribed === true) {
        for (const email of emails) {
          await unsubscribeEmail({ email, source: 'resend_webhook' });
        }
        handled = true;
      }
      break;
    }

    case 'contact.deleted': {
      for (const email of emails) {
        await unsubscribeEmail({ email, source: 'resend_webhook' });
      }
      handled = true;
      break;
    }

    case 'email.bounced': {
      // Soft bounces are a full mailbox or a temporary server problem and
      // resolve on their own. Removing on the first one would quietly shed
      // subscribers who never asked to leave.
      const type = (event.data?.bounce?.type || '').toLowerCase();
      const permanent = type.includes('permanent') || type.includes('hard');

      if (permanent) {
        for (const email of emails) {
          await unsubscribeEmail({ email, source: 'resend_webhook', reason: 'bounced' });
        }
        handled = true;
      } else {
        console.log(`[newsletter:webhook] soft bounce for ${emails.join(', ')} — no action`);
      }
      break;
    }

    case 'email.complained': {
      // Someone hit "report spam". Stop immediately — every further send from
      // this domain is scored against us.
      for (const email of emails) {
        await unsubscribeEmail({ email, source: 'resend_webhook', reason: 'complained' });
      }
      handled = true;
      break;
    }
  }

  return NextResponse.json({ received: true, handled });
}
