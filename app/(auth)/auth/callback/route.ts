import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { absorbSubscriberRow, subscribeProfile } from '@/lib/newsletter';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // For OAuth signups, populate profile name from provider metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const firstName = meta.first_name || meta.given_name || meta.name?.split(' ')[0] || null;
        const lastName = meta.last_name || meta.family_name || meta.name?.split(' ').slice(1).join(' ') || null;

        if (firstName || lastName) {
          const admin = createAdminClient();
          // Only update if names are currently null (don't overwrite manual edits)
          const { data: profile } = await admin
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .single();

          if (profile && !profile.first_name && !profile.last_name) {
            await admin
              .from('profiles')
              .update({ first_name: firstName, last_name: lastName })
              .eq('id', user.id);
          }
        }

        // Complete a newsletter opt-in that was taken on the signup form.
        //
        // Reaching this point means the address is verified — they clicked the
        // link Supabase sent them, or signed in through a provider that already
        // verified it. Only now does the contact go to Resend.
        if (user.email) {
          const admin = createAdminClient();
          const { data: consent } = await admin
            .from('profiles')
            .select('newsletter_pending_opt_in, first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();

          if (consent?.newsletter_pending_opt_in) {
            await subscribeProfile({
              profileId: user.id,
              email: user.email,
              firstName: consent.first_name,
              lastName: consent.last_name,
              source: 'signup_checkbox',
            });

            await admin
              .from('profiles')
              .update({ newsletter_pending_opt_in: false })
              .eq('id', user.id);
          }

          // An OAuth signup never passes through the welcome-profile handler,
          // so this is where a pre-existing footer subscription gets folded in
          // for those accounts.
          await absorbSubscriberRow(user.email, user.id);
        }

        // Send welcome email for first-time OAuth users
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .single();

        if (profile) {
          const createdAt = new Date(profile.created_at);
          const now = new Date();
          // If profile was created in the last 30 seconds, this is a new signup
          if (now.getTime() - createdAt.getTime() < 30000) {
            try {
              const welcomeUrl = new URL('/api/contact', origin);
              await fetch(welcomeUrl.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'welcome',
                  email: user.email,
                  firstName: user.user_metadata?.first_name || user.user_metadata?.given_name || user.user_metadata?.name?.split(' ')[0],
                  lastName: user.user_metadata?.last_name || user.user_metadata?.family_name,
                }),
              });
            } catch {
              // Don't block redirect if email fails
            }
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
