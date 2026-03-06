import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

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

        await supabase
          .from('profiles')
          .update({
            subscription_status: 'paid',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            subscription_interval: sub.items.data[0]?.plan.interval === 'year' ? 'year' : 'month',
            subscription_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            subscription_cancel_at_period_end: sub.cancel_at_period_end,
          })
          .eq('id', userId);
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
