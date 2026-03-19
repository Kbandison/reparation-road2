import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { stripe } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMembershipEmail } from '@/lib/email';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Reparation Road <noreply@reparationroad.org>';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'admin@reparationroad.org';

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature')!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const subscriptionId = session.subscription as string;

      if (userId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const sub = subscription as unknown as {
          items: { data: { plan: { interval: string } }[] };
          current_period_start: number;
          current_period_end: number;
          cancel_at_period_end: boolean;
        };

        const interval = sub.items.data[0]?.plan.interval === 'year' ? 'year' as const : 'month' as const;

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'paid',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            subscription_interval: interval,
            subscription_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            subscription_cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq('id', userId);

        // Send membership confirmation email + notify owner
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, first_name, last_name')
            .eq('id', userId)
            .single();

          if (profile?.email) {
            await sendMembershipEmail(profile.email, profile.first_name, interval);

            const userName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';
            const planName = interval === 'year' ? 'Premium Yearly' : 'Premium Monthly';

            // Notify owner of new upgrade
            await resend.emails.send({
              from: FROM,
              to: [ADMIN_EMAIL],
              subject: `New Premium Member: ${userName}`,
              html: `
                <h2>New Membership Upgrade</h2>
                <p><strong>Name:</strong> ${userName}</p>
                <p><strong>Email:</strong> ${profile.email}</p>
                <p><strong>Plan:</strong> ${planName}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
                <p><a href="https://reparationroad.org/admin/users">View in Admin Panel</a></p>
              `,
            });
          }
        } catch {
          // Don't fail the webhook if email fails
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as unknown as {
        customer: string;
        items: { data: { plan: { interval: string } }[] };
        current_period_start: number;
        current_period_end: number;
        cancel_at_period_end: boolean;
      };

      await supabase
        .from('profiles')
        .update({
          subscription_interval: subscription.items.data[0]?.plan.interval === 'year' ? 'year' : 'month',
          subscription_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          subscription_cancel_at_period_end: subscription.cancel_at_period_end,
        })
        .eq('stripe_customer_id', subscription.customer);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as unknown as { customer: string };

      await supabase
        .from('profiles')
        .update({
          subscription_status: 'free',
          stripe_subscription_id: null,
          subscription_interval: null,
          subscription_period_start: null,
          subscription_period_end: null,
          subscription_cancel_at_period_end: false,
        })
        .eq('stripe_customer_id', subscription.customer);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
