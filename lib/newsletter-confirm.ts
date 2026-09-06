import { createAdminClient } from '@/lib/supabase/admin';
import { absorbSubscriberRow, syncContactToResend } from '@/lib/newsletter';
import { sendNewsletterWelcomeEmail } from '@/lib/newsletter-emails';

/**
 * Turn a pending footer signup into a live subscription.
 *
 * Lives apart from lib/newsletter.ts only to keep that module free of a
 * dependency on the email templates, which import from it in turn.
 */
export async function confirmSubscriber(input: {
  subscriberId: string;
  email: string;
  firstName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const sync = await syncContactToResend({
    email: input.email,
    firstName: input.firstName,
    subscribed: true,
  });

  // The consent is real whether or not Resend accepted the contact — record it
  // either way and let the reconcile job retry the sync. Losing the consent
  // because of a transient API failure would mean asking the person to opt in
  // a second time.
  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({
      status: 'subscribed',
      confirmed_at: now,
      confirm_token: null,
      resend_contact_id: sync.contactId ?? null,
      synced_at: sync.ok ? now : null,
      sync_error: sync.ok ? null : sync.error ?? 'sync failed',
    })
    .eq('id', input.subscriberId);

  if (error) {
    console.error('[newsletter] failed to confirm subscriber:', error);
    return { ok: false, error: 'could not update subscriber' };
  }

  // Someone who already has an account and subscribes from the footer should
  // end up as one record, not two.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', input.email)
    .maybeSingle();

  if (profile) {
    await absorbSubscriberRow(input.email, profile.id);
  }

  await sendNewsletterWelcomeEmail(input.email, input.firstName);

  return { ok: true };
}
