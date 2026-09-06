import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncContactToResend, newsletterConfigured } from '@/lib/newsletter';

/**
 * Repair subscriptions that never reached Resend.
 *
 * The live sync is deliberately allowed to fail — signup must not break because
 * the email API was slow — so something has to pick up the pieces. This walks
 * everyone whose consent is recorded here but whose contact was never confirmed
 * in the audience, and pushes them again.
 *
 * Runs daily rather than hourly: Vercel's Hobby plan caps cron at once per day.
 * That is a tolerable gap because a stuck row only matters if a newsletter goes
 * out before the next pass, and issues ship weekly at most. It can also be
 * triggered by hand at any time — GET this path with the CRON_SECRET as a
 * bearer token. If the schedule ever needs to be tighter, it is a Pro-plan
 * change plus one line in vercel.json.
 *
 * The one rule this job must never break: it only ever looks at rows that are
 * currently 'subscribed'. Anyone unsubscribed or cleaned is invisible to it, so
 * there is no path by which a reconcile pass can re-subscribe someone who opted
 * out.
 */

const BATCH_SIZE = 100;

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends the project's CRON_SECRET as a bearer token.
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!newsletterConfigured()) {
    return NextResponse.json(
      { error: 'RESEND_NEWSLETTER_AUDIENCE_ID is not configured' },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let repaired = 0;
  let failed = 0;

  // --- Account holders -----------------------------------------------------

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, resend_contact_id')
    .eq('newsletter_status', 'subscribed')
    .is('newsletter_synced_at', null)
    .limit(BATCH_SIZE);

  for (const profile of profiles ?? []) {
    if (!profile.email) continue;

    const sync = await syncContactToResend({
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      subscribed: true,
      contactId: profile.resend_contact_id,
    });

    await supabase
      .from('profiles')
      .update({
        resend_contact_id: sync.contactId ?? profile.resend_contact_id ?? null,
        newsletter_synced_at: sync.ok ? now : null,
        newsletter_sync_error: sync.ok ? null : sync.error ?? 'sync failed',
      })
      .eq('id', profile.id);

    if (sync.ok) repaired++;
    else failed++;
  }

  // --- Footer subscribers with no account ----------------------------------

  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, first_name, resend_contact_id')
    .eq('status', 'subscribed')
    .is('synced_at', null)
    .limit(BATCH_SIZE);

  for (const subscriber of subscribers ?? []) {
    const sync = await syncContactToResend({
      email: subscriber.email,
      firstName: subscriber.first_name,
      subscribed: true,
      contactId: subscriber.resend_contact_id,
    });

    await supabase
      .from('newsletter_subscribers')
      .update({
        resend_contact_id: sync.contactId ?? subscriber.resend_contact_id ?? null,
        synced_at: sync.ok ? now : null,
        sync_error: sync.ok ? null : sync.error ?? 'sync failed',
      })
      .eq('id', subscriber.id);

    if (sync.ok) repaired++;
    else failed++;
  }

  // --- Expire stale confirmations ------------------------------------------
  // A pending signup that was never confirmed is not consent. Clearing the
  // token after 30 days keeps unconfirmed addresses from lingering
  // indefinitely with a live confirmation link attached.

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: expired } = await supabase
    .from('newsletter_subscribers')
    .update({ confirm_token: null }, { count: 'exact' })
    .eq('status', 'pending')
    .lt('confirm_sent_at', thirtyDaysAgo)
    .not('confirm_token', 'is', null);

  const summary = {
    repaired,
    failed,
    expiredConfirmations: expired ?? 0,
    // Both queries are capped, so a large backlog drains over successive runs
    // rather than being silently truncated to whatever fit in one pass.
    truncated:
      (profiles?.length ?? 0) === BATCH_SIZE || (subscribers?.length ?? 0) === BATCH_SIZE,
  };

  console.log('[newsletter:reconcile]', JSON.stringify(summary));
  return NextResponse.json(summary);
}
