import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { absorbSubscriberRow, subscribeProfile } from '@/lib/newsletter';
import { notifyAdminOfSignup, sendAccountWelcomeEmail } from '@/lib/email';

/**
 * Where a confirmed sign-in lands — and where account setup actually happens.
 *
 * This work used to run in the browser, which POSTed a user id to /api/contact
 * and trusted it. That endpoint has no authentication, so anyone holding a
 * profile UUID could write names and donor status to that account, and ask for
 * a welcome email to be sent to any address they chose.
 *
 * Everything now happens here instead, because this is the first moment a real
 * session exists. The signup form passes what it collected through Supabase
 * user metadata rather than a request body, so the values arrive attached to
 * the authenticated user rather than alongside a claim about who they are.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      await completeAccountSetup(user);
    } catch (e) {
      // Setup is best-effort. Someone who has just confirmed their email should
      // land on their dashboard even if a follow-up step failed.
      console.error('[auth] account setup failed:', e);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

async function completeAccountSetup(user: AuthUser) {
  const admin = createAdminClient();
  const meta = user.user_metadata ?? {};

  const str = (key: string): string | null => {
    const value = meta[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  // OAuth providers use different shapes for the same two fields.
  const firstName =
    str('first_name') || str('given_name') || str('name')?.split(' ')[0] || null;
  const lastName =
    str('last_name') ||
    str('family_name') ||
    str('name')?.split(' ').slice(1).join(' ') ||
    null;

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, subscription_status, welcome_email_sent_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return;

  const updates: Record<string, unknown> = {};

  // Only fill blanks — this runs on every sign-in through a provider, and must
  // never overwrite a name the user has since edited.
  if (!profile.first_name && !profile.last_name && (firstName || lastName)) {
    updates.first_name = firstName;
    updates.last_name = lastName;
  }

  // Validated here, not in the browser. The code never leaves the server, so
  // metadata claiming donor status is worth nothing without it.
  const donorCode = str('donor_code');
  const expected = process.env.DONOR_CODE || 'RRDONOR0326';
  if (
    donorCode &&
    donorCode.toUpperCase() === expected.toUpperCase() &&
    profile.subscription_status === 'free'
  ) {
    updates.subscription_status = 'donor';
  }

  if (Object.keys(updates).length > 0) {
    await admin.from('profiles').update(updates).eq('id', user.id);
  }

  // The welcome email is sent once, on first confirmation. Without the stamp a
  // refreshed callback would mail the same person again.
  if (!profile.welcome_email_sent_at && user.email) {
    await admin
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', user.id);

    const displayName =
      [firstName ?? profile.first_name, lastName ?? profile.last_name]
        .filter(Boolean)
        .join(' ') || 'Unknown';

    await sendAccountWelcomeEmail(user.email, firstName ?? profile.first_name);
    await notifyAdminOfSignup(user.email, displayName);
  }

  if (!user.email) return;

  // Fold in any newsletter subscription taken from the footer before they
  // registered, so one person is not two records.
  await absorbSubscriberRow(user.email, user.id);

  // Newsletter consent given on the signup form. Only acted on now, because
  // only now is the address confirmed.
  const optedIn = meta.newsletter_opt_in === true || meta.newsletter_opt_in === 'true';
  const { data: consent } = await admin
    .from('profiles')
    .select('newsletter_status, newsletter_pending_opt_in, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  const wanted = optedIn || consent?.newsletter_pending_opt_in;
  if (wanted && consent?.newsletter_status !== 'subscribed') {
    await subscribeProfile({
      profileId: user.id,
      email: user.email,
      firstName: consent?.first_name,
      lastName: consent?.last_name,
      source: 'signup_checkbox',
    });
  }

  if (consent?.newsletter_pending_opt_in) {
    await admin
      .from('profiles')
      .update({ newsletter_pending_opt_in: false })
      .eq('id', user.id);
  }
}
