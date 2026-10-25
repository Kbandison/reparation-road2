import { Resend } from 'resend';

// Server-only: reads RESEND_API_KEY.

let client: Resend | null = null;

/**
 * The shared Resend client, created on first use. Creating it when a module
 * loads made every build without the key fail (Vercel previews have no email
 * key): `new Resend()` throws on a missing key, and the build loads route
 * modules to read their config.
 */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  client ??= new Resend(key);
  return client;
}
