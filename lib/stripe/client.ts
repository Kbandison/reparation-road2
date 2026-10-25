import Stripe from 'stripe';

// Server-only: reads STRIPE_SECRET_KEY.

let client: Stripe | null = null;

/**
 * The shared Stripe client, created on first use rather than when a module
 * loads, so a build or preview without the key still builds (the constructor
 * throws without one).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  client ??= new Stripe(key);
  return client;
}
