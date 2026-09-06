import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  requestIp,
  subscribeProfile,
  unsubscribeEmail,
} from '@/lib/newsletter';

/**
 * The signed-in member's own newsletter preference.
 *
 * This is the route behind the toggle in account settings, and it exists so
 * that "keep my account, stop the newsletter" is a single action that does not
 * touch billing or the account itself.
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('profiles')
    .select('newsletter_status, newsletter_opted_in_at')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json({
    status: data?.newsletter_status ?? 'unsubscribed',
    optedInAt: data?.newsletter_opted_in_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.subscribed !== 'boolean') {
    return NextResponse.json({ error: 'Missing subscribed flag' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('email, first_name, last_name, newsletter_status')
    .eq('id', user.id)
    .maybeSingle();

  const email = profile?.email || user.email;
  if (!email) {
    return NextResponse.json({ error: 'No email on file' }, { status: 400 });
  }

  const ip = requestIp(request);
  const userAgent = request.headers.get('user-agent');

  if (body.subscribed) {
    // Signing in and asking for it back is the one action that can revive an
    // address previously removed for a bounce or complaint — it proves the
    // account holder wants the mail, which an automated re-sync never does.
    const result = await subscribeProfile({
      profileId: user.id,
      email,
      firstName: profile?.first_name,
      lastName: profile?.last_name,
      source: 'account_settings',
      ip,
      userAgent,
    });

    if (!result.ok && !result.skipped) {
      // The preference is saved regardless; the reconcile job retries delivery
      // setup. Telling the member it failed would be misleading.
      console.error('[newsletter] preference saved but sync failed:', result.error);
    }

    return NextResponse.json({ status: 'subscribed' });
  }

  await unsubscribeEmail({
    email,
    source: 'account_settings',
    ip,
    userAgent,
  });

  return NextResponse.json({ status: 'unsubscribed' });
}
