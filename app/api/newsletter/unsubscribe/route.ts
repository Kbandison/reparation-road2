import { NextResponse } from 'next/server';
import {
  normalizeEmail,
  requestIp,
  unsubscribeEmail,
  verifyUnsubscribeToken,
} from '@/lib/newsletter';

/**
 * One-click unsubscribe, from the link in the footer of every newsletter.
 *
 * No sign-in: someone who wants out must be able to get out from the email
 * itself, on any device, without remembering a password. The signed token in
 * the link is what stops it being used to unsubscribe arbitrary addresses.
 *
 * POST is what Gmail and Apple Mail call for their native unsubscribe button
 * (RFC 8058); the browser-facing page posts to the same handler.
 */
async function handle(request: Request, email: string, token: string) {
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json(
      { error: 'That unsubscribe link is not valid.' },
      { status: 400 },
    );
  }

  await unsubscribeEmail({
    email: normalizeEmail(email),
    source: 'email_unsubscribe_link',
    ip: requestIp(request),
    userAgent: request.headers.get('user-agent'),
  });

  // Always reports success, even when the address matched nothing. The person
  // asked not to receive mail; whether we held a record is not their problem,
  // and saying so would leak whether an address is on the list.
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let email = url.searchParams.get('email') || '';
  let token = url.searchParams.get('token') || '';

  if (!email || !token) {
    const body = await request.json().catch(() => ({}));
    email = email || body.email || '';
    token = token || body.token || '';
  }

  return handle(request, email, token);
}
