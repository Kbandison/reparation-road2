import crypto from 'crypto';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Newsletter subscriber sync.
 *
 * Supabase is the source of truth for *who a member is*. Resend is the source
 * of truth for *consent changes made in the inbox* — an unsubscribe click
 * happens inside the email, so it lands at Resend first and is written back
 * here by the webhook at app/api/newsletter/webhook.
 *
 * Everything in this module is written so it can fail without taking anything
 * else down with it. Signup must never break because Resend had a bad minute,
 * so callers get a result object rather than an exception, and the reconcile
 * cron picks up whatever didn't land.
 */

const resend = new Resend(process.env.RESEND_API_KEY);

const AUDIENCE_ID = process.env.RESEND_NEWSLETTER_AUDIENCE_ID;

// The newsletter sends from its own authenticated subdomain so that marketing
// volume can never damage the deliverability of password resets and receipts,
// which keep going out from noreply@reparationroad.org.
export const NEWSLETTER_FROM =
  process.env.NEWSLETTER_FROM || 'The Road Report <news@news.reparationroad.org>';

// Replies are a feature, not a nuisance — readers write back with their own
// family records. Never point the newsletter at a no-reply address.
export const NEWSLETTER_REPLY_TO =
  process.env.NEWSLETTER_REPLY_TO || 'hello@reparationroad.org';

const CANONICAL_URL = 'https://www.reparationroad.org';

/**
 * Base URL for links inside emails.
 *
 * Guarded rather than trusted. NEXT_PUBLIC_APP_URL is correctly set to
 * localhost for development, so copying a local env file into a hosted
 * environment silently produces confirmation and unsubscribe links pointing at
 * localhost — which is exactly what happened on the first production send.
 *
 * A wrong URL on a web page is a redeploy away from fixed. A wrong URL in an
 * email is permanent the moment it lands in someone's inbox, so this refuses a
 * local address whenever it is not actually running locally, and says so loudly
 * enough to be found in the logs.
 */
function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const isLocal =
    !configured || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(configured);

  if (isLocal && process.env.NODE_ENV === 'production') {
    console.error(
      `[newsletter] NEXT_PUBLIC_APP_URL is ${configured ?? 'unset'} in a production ` +
        `build — email links would point at localhost. Falling back to ${CANONICAL_URL}. ` +
        `Fix the environment variable; this also affects Stripe redirect URLs, which have ` +
        `no such fallback.`,
    );
    return CANONICAL_URL;
  }

  return configured || CANONICAL_URL;
}

export const SITE_URL = resolveSiteUrl();

// CAN-SPAM requires a physical postal address in every marketing email.
export const POSTAL_ADDRESS =
  process.env.NEWSLETTER_POSTAL_ADDRESS ||
  'Reparation Road · [add mailing address before the first send]';

export type NewsletterStatus = 'subscribed' | 'unsubscribed' | 'cleaned';

export type ConsentSource =
  | 'signup_checkbox'
  | 'footer_form'
  | 'account_settings'
  | 'email_unsubscribe_link'
  | 'resend_webhook'
  | 'admin'
  | 'import';

export type ConsentEvent =
  | 'subscribed'
  | 'confirmed'
  | 'unsubscribed'
  | 'bounced'
  | 'complained'
  | 'resubscribed';

export function newsletterConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && AUDIENCE_ID);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Deliberately permissive — the confirmation step is what actually proves an
  // address works. This only catches obvious junk before we spend an API call.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/* -------------------------------------------------------------------------- */
/* Signed tokens                                                              */
/* -------------------------------------------------------------------------- */

function tokenSecret(): string {
  return (
    process.env.NEWSLETTER_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'reparation-road-dev-secret'
  );
}

/**
 * One-click unsubscribe links in our own broadcasts carry this instead of a
 * database lookup id, so the link works for account holders and footer-only
 * subscribers alike without exposing an enumerable identifier.
 */
export function createUnsubscribeToken(email: string): string {
  return crypto
    .createHmac('sha256', tokenSecret())
    .update(`unsubscribe:${normalizeEmail(email)}`)
    .digest('base64url');
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = createUnsubscribeToken(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(token || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  const params = new URLSearchParams({
    email: normalizeEmail(email),
    token: createUnsubscribeToken(email),
  });
  return `${SITE_URL}/newsletter/unsubscribe?${params}`;
}

export function createConfirmToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function confirmUrl(token: string): string {
  return `${SITE_URL}/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

/* -------------------------------------------------------------------------- */
/* Resend audience sync                                                        */
/* -------------------------------------------------------------------------- */

export interface SyncResult {
  ok: boolean;
  contactId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Upsert a contact into the newsletter audience.
 *
 * Safe to call repeatedly with the same address — Resend rejects a duplicate
 * create and we fall through to an update. Pass `contactId` when you have one
 * so a stale-id case can still be recovered; use replaceContactEmail() when the
 * address itself changed.
 */
export async function syncContactToResend(input: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  subscribed: boolean;
  contactId?: string | null;
}): Promise<SyncResult> {
  if (!newsletterConfigured()) {
    console.warn(
      '[newsletter] RESEND_API_KEY or RESEND_NEWSLETTER_AUDIENCE_ID is not set — contact not synced',
    );
    return { ok: false, skipped: true, error: 'newsletter not configured' };
  }

  const email = normalizeEmail(input.email);
  const audienceId = AUDIENCE_ID!;

  const fields = {
    firstName: input.firstName || undefined,
    lastName: input.lastName || undefined,
    unsubscribed: !input.subscribed,
  };

  try {
    // Email is the natural key inside an audience, so create-then-update is the
    // idempotent path: a repeat call for the same address updates rather than
    // duplicating. That property is what lets the reconcile cron re-run over
    // everyone safely.
    const created = await resend.contacts.create({ audienceId, email, ...fields });

    if (!created.error && created.data?.id) {
      return { ok: true, contactId: created.data.id };
    }

    const updated = await resend.contacts.update({ audienceId, email, ...fields });
    if (updated.error) {
      const message =
        (updated.error as { message?: string }).message || 'contact update failed';
      console.error(`[newsletter] failed to sync ${email}:`, updated.error);
      return { ok: false, error: message };
    }

    const found = await resend.contacts.get({ audienceId, email });
    return { ok: true, contactId: found.data?.id ?? input.contactId ?? undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'contact sync threw';
    console.error(`[newsletter] failed to sync ${email}:`, e);
    return { ok: false, error: message };
  }
}

/**
 * Move a subscriber to a new address.
 *
 * Resend contacts are keyed on email within an audience and the API has no
 * "change the email" operation, so the old contact has to be dropped by id and
 * a fresh one created. Without this a member who updates their email in account
 * settings silently stops receiving the newsletter while the orphaned old
 * contact keeps counting against the audience.
 */
export async function replaceContactEmail(input: {
  oldContactId?: string | null;
  oldEmail?: string | null;
  newEmail: string;
  firstName?: string | null;
  lastName?: string | null;
  subscribed: boolean;
}): Promise<SyncResult> {
  if (!newsletterConfigured()) return { ok: false, skipped: true };

  if (input.oldContactId || input.oldEmail) {
    try {
      await resend.contacts.remove(
        input.oldContactId
          ? { audienceId: AUDIENCE_ID!, id: input.oldContactId }
          : { audienceId: AUDIENCE_ID!, email: normalizeEmail(input.oldEmail!) },
      );
    } catch (e) {
      // A contact that's already gone is the state we wanted anyway.
      console.warn('[newsletter] could not remove stale contact:', e);
    }
  }

  return syncContactToResend({
    email: input.newEmail,
    firstName: input.firstName,
    lastName: input.lastName,
    subscribed: input.subscribed,
  });
}

/** Mark a contact unsubscribed in the audience. Absent contacts are a no-op. */
export async function unsubscribeContactInResend(input: {
  email: string;
  contactId?: string | null;
}): Promise<SyncResult> {
  if (!newsletterConfigured()) return { ok: false, skipped: true };

  const email = normalizeEmail(input.email);

  try {
    const { error } = await resend.contacts.update(
      input.contactId
        ? { audienceId: AUDIENCE_ID!, id: input.contactId, unsubscribed: true }
        : { audienceId: AUDIENCE_ID!, email, unsubscribed: true },
    );
    if (error) {
      // A contact that isn't in the audience is already in the desired state.
      console.warn(`[newsletter] unsubscribe for ${email} reported:`, error);
      return { ok: true };
    }
    return { ok: true, contactId: input.contactId || undefined };
  } catch (e) {
    console.error(`[newsletter] failed to unsubscribe ${email}:`, e);
    return { ok: false, error: e instanceof Error ? e.message : 'unsubscribe threw' };
  }
}

/* -------------------------------------------------------------------------- */
/* Consent record                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Append to the consent audit trail. Never throws: a missing audit row must
 * not roll back the consent change the subscriber actually asked for.
 */
export async function recordConsentEvent(input: {
  email: string;
  event: ConsentEvent;
  source: ConsentSource;
  profileId?: string | null;
  subscriberId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('newsletter_events').insert({
      email: normalizeEmail(input.email),
      event: input.event,
      source: input.source,
      profile_id: input.profileId ?? null,
      subscriber_id: input.subscriberId ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    console.error('[newsletter] failed to record consent event:', e);
  }
}

/** Best-effort client IP, for the consent record. */
export function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

/* -------------------------------------------------------------------------- */
/* Member record helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Subscribe an account holder and push them to the audience.
 *
 * Account holders confirmed their address to register, so there is no second
 * confirmation step here — only the public footer form needs that.
 */
export async function subscribeProfile(input: {
  profileId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  source: ConsentSource;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SyncResult> {
  const supabase = createAdminClient();
  const email = normalizeEmail(input.email);

  const { data: existing } = await supabase
    .from('profiles')
    .select('newsletter_status, resend_contact_id')
    .eq('id', input.profileId)
    .maybeSingle();

  // A hard bounce or spam complaint took this address out of circulation.
  // Only an explicit action by the person themselves brings it back, never an
  // automated sync.
  if (existing?.newsletter_status === 'cleaned' && input.source !== 'account_settings') {
    return { ok: false, skipped: true, error: 'address was cleaned' };
  }

  const sync = await syncContactToResend({
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    subscribed: true,
    contactId: existing?.resend_contact_id,
  });

  await supabase
    .from('profiles')
    .update({
      newsletter_status: 'subscribed',
      newsletter_opted_in_at: new Date().toISOString(),
      newsletter_opt_in_source: input.source,
      newsletter_unsubscribed_at: null,
      resend_contact_id: sync.contactId ?? existing?.resend_contact_id ?? null,
      newsletter_synced_at: sync.ok ? new Date().toISOString() : null,
      newsletter_sync_error: sync.ok ? null : sync.error ?? 'sync failed',
    })
    .eq('id', input.profileId);

  await recordConsentEvent({
    email,
    event: existing?.newsletter_status === 'unsubscribed' ? 'resubscribed' : 'subscribed',
    source: input.source,
    profileId: input.profileId,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return sync;
}

/**
 * Withdraw consent for an address, wherever it lives.
 *
 * Deliberately keyed on email rather than account id: an unsubscribe arriving
 * from a webhook or a link in an email knows the address and nothing else, and
 * the same person may exist both as an account holder and as a footer signup.
 * Both rows have to move together or the next send will still reach them.
 */
export async function unsubscribeEmail(input: {
  email: string;
  source: ConsentSource;
  reason?: 'unsubscribed' | 'bounced' | 'complained';
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: boolean; matched: boolean }> {
  const supabase = createAdminClient();
  const email = normalizeEmail(input.email);
  const reason = input.reason || 'unsubscribed';

  // Bounces and complaints are a deliverability removal, not a user choice —
  // 'cleaned' keeps that distinction visible in the admin panel.
  const status: NewsletterStatus =
    reason === 'unsubscribed' ? 'unsubscribed' : 'cleaned';
  const now = new Date().toISOString();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, resend_contact_id')
    .ilike('email', email)
    .maybeSingle();

  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, resend_contact_id')
    .ilike('email', email)
    .maybeSingle();

  // A user-initiated unsubscribe already happened at Resend's end; syncing it
  // back is harmless and covers unsubscribes that started on our side.
  await unsubscribeContactInResend({
    email,
    contactId: profile?.resend_contact_id || subscriber?.resend_contact_id,
  });

  if (profile) {
    await supabase
      .from('profiles')
      .update({
        newsletter_status: status,
        newsletter_unsubscribed_at: now,
        newsletter_synced_at: now,
        newsletter_sync_error: null,
      })
      .eq('id', profile.id);
  }

  if (subscriber) {
    await supabase
      .from('newsletter_subscribers')
      .update({ status, unsubscribed_at: now, synced_at: now, sync_error: null })
      .eq('id', subscriber.id);
  }

  await recordConsentEvent({
    email,
    event: reason,
    source: input.source,
    profileId: profile?.id,
    subscriberId: subscriber?.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true, matched: Boolean(profile || subscriber) };
}

/**
 * Fold a standalone subscriber row into an account.
 *
 * The same person can arrive twice — subscribing from the footer months before
 * registering, or registering first and subscribing from the footer later.
 * Left alone that produces two rows for one address, which the reconcile job
 * would then push to Resend twice. Whichever side confirms second calls this
 * to collapse them, carrying the earlier consent date across so the audit trail
 * still reflects when they actually opted in.
 */
export async function absorbSubscriberRow(
  email: string,
  profileId: string,
): Promise<{ carriedConsent: boolean }> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, status, confirmed_at, opt_in_source, resend_contact_id')
    .ilike('email', normalized)
    .maybeSingle();

  if (!subscriber) return { carriedConsent: false };

  const alreadySubscribed = subscriber.status === 'subscribed';

  if (alreadySubscribed) {
    await supabase
      .from('profiles')
      .update({
        newsletter_status: 'subscribed',
        newsletter_opted_in_at: subscriber.confirmed_at,
        newsletter_opt_in_source: subscriber.opt_in_source || 'footer_form',
        newsletter_unsubscribed_at: null,
        resend_contact_id: subscriber.resend_contact_id,
      })
      .eq('id', profileId);
  }

  // The consent history lives in newsletter_events keyed on email, so it
  // survives the row going away.
  await supabase
    .from('newsletter_events')
    .update({ profile_id: profileId, subscriber_id: null })
    .eq('subscriber_id', subscriber.id);

  await supabase.from('newsletter_subscribers').delete().eq('id', subscriber.id);

  return { carriedConsent: alreadySubscribed };
}
