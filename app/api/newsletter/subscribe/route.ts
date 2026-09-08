import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createConfirmToken,
  isValidEmail,
  normalizeEmail,
  recordConsentEvent,
  requestIp,
} from '@/lib/newsletter';
import { sendConfirmationEmail } from '@/lib/newsletter-emails';
import { checkRateLimits, rateLimitHeaders } from '@/lib/rate-limit';
import { confirmSubscriber } from '@/lib/newsletter-confirm';

/**
 * Public newsletter signup — the footer form.
 *
 * Anyone can post here, so nothing is added to the audience until the address
 * is confirmed by clicking a link. That keeps typo'd addresses and bot
 * submissions out of the sending list, which is what protects the domain's
 * deliverability over time.
 *
 * Every response is deliberately identical whether or not the address is
 * already known. A different message for a known address would turn this into
 * a way to test whether someone has a Reparation Road account.
 */

const GENERIC_RESPONSE = {
  success: true,
  message: 'Check your email for a link to confirm your subscription.',
};

/**
 * Limits on the public signup endpoint.
 *
 * The honeypot and the per-address cooldown that were already here both stop
 * the lazy case and neither stops the real one: a script cycling addresses
 * trips neither. Left unbounded that burns the Resend quota and gets the
 * sending domain flagged, which takes the newsletter down for everyone and is
 * slow to undo.
 *
 * Per-IP is deliberately generous — a household or library behind one address
 * might legitimately sign up a few people — while the global ceiling is what
 * actually caps the damage from a distributed flood, since it does not care how
 * many addresses the traffic comes from.
 */
const PER_IP = { limit: 5, windowSeconds: 3600 };
const GLOBAL = { limit: 100, windowSeconds: 3600 };

export async function POST(request: Request) {
  let body: { email?: string; firstName?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot: a hidden field real people never fill in. Bots fill everything.
  if (body.website) return NextResponse.json(GENERIC_RESPONSE);

  const ip = requestIp(request) || 'unknown';
  const gate = await checkRateLimits([
    { key: `newsletter:subscribe:ip:${ip}`, ...PER_IP },
    { key: 'newsletter:subscribe:global', ...GLOBAL },
  ]);

  if (!gate.allowed) {
    console.warn(`[newsletter] rate limit hit from ${ip}`);
    return NextResponse.json(
      { error: 'Too many signups from here just now. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(gate) },
    );
  }

  const rawEmail = body.email || '';
  if (!isValidEmail(rawEmail)) {
    return NextResponse.json(
      { error: 'Enter a valid email address.' },
      { status: 400 },
    );
  }

  const email = normalizeEmail(rawEmail);
  const firstName = body.firstName?.trim() || null;
  const supabase = createAdminClient();
  const userAgent = request.headers.get('user-agent');

  // An address removed for a hard bounce or a spam complaint is not re-added by
  // a form post. Only the person themselves, signed in, can bring it back.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, newsletter_status')
    .ilike('email', email)
    .maybeSingle();

  if (profile?.newsletter_status === 'cleaned') {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  if (profile?.newsletter_status === 'subscribed') {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  const { data: existing } = await supabase
    .from('newsletter_subscribers')
    .select('id, status, confirm_token, confirm_sent_at')
    .ilike('email', email)
    .maybeSingle();

  if (existing?.status === 'cleaned') {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  if (existing?.status === 'subscribed') {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  // Resending the confirmation is fine — people lose the first one — but not so
  // often that this endpoint becomes a way to bombard an address.
  if (existing?.confirm_sent_at) {
    const minutesSinceLast =
      (Date.now() - new Date(existing.confirm_sent_at).getTime()) / 60_000;
    if (minutesSinceLast < 5) {
      return NextResponse.json(GENERIC_RESPONSE);
    }
  }

  const token = createConfirmToken();
  const now = new Date().toISOString();

  if (existing) {
    await supabase
      .from('newsletter_subscribers')
      .update({
        first_name: firstName ?? undefined,
        status: 'pending',
        confirm_token: token,
        confirm_sent_at: now,
        opt_in_ip: ip,
        opt_in_user_agent: userAgent,
      })
      .eq('id', existing.id);
  } else {
    const { error } = await supabase.from('newsletter_subscribers').insert({
      email,
      first_name: firstName,
      status: 'pending',
      confirm_token: token,
      confirm_sent_at: now,
      opt_in_source: 'footer_form',
      opt_in_ip: ip,
      opt_in_user_agent: userAgent,
    });

    if (error) {
      console.error('[newsletter] failed to create pending subscriber:', error);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 },
      );
    }
  }

  // Log the request as well as the later confirmation. Under double opt-in the
  // confirmation click is what constitutes consent, but the submission is the
  // part that carries the originating IP and user agent — and the pending row
  // holding those is deleted once the address is folded into an account.
  await recordConsentEvent({
    email,
    event: 'subscribed',
    source: 'footer_form',
    ip,
    userAgent,
    metadata: { pending_confirmation: true },
  });

  const sent = await sendConfirmationEmail(email, token);
  if (!sent.ok) {
    return NextResponse.json(
      { error: 'We could not send the confirmation email. Please try again.' },
      { status: 502 },
    );
  }

  return NextResponse.json(GENERIC_RESPONSE);
}

/**
 * Confirm a pending subscription. Called by the link in the confirmation email.
 */
export async function PUT(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing confirmation token' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, first_name, status, opt_in_ip, opt_in_user_agent')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!subscriber) {
    return NextResponse.json(
      { error: 'That confirmation link is no longer valid.' },
      { status: 404 },
    );
  }

  if (subscriber.status === 'subscribed') {
    return NextResponse.json({ success: true, email: subscriber.email });
  }

  const result = await confirmSubscriber({
    subscriberId: subscriber.id,
    email: subscriber.email,
    firstName: subscriber.first_name,
    ip: subscriber.opt_in_ip,
    userAgent: subscriber.opt_in_user_agent,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'We could not complete your subscription. Please try again.' },
      { status: 500 },
    );
  }

  await recordConsentEvent({
    email: subscriber.email,
    event: 'confirmed',
    source: 'footer_form',
    subscriberId: subscriber.id,
    // The IP that clicked the link, which is the one that evidences consent.
    // The submitting IP was already recorded against the 'subscribed' event.
    ip: requestIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ success: true, email: subscriber.email });
}
