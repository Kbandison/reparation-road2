import { NextResponse } from 'next/server';
import { checkRateLimits, rateLimitHeaders } from '@/lib/rate-limit';
import { requestIp } from '@/lib/newsletter';
import { BOT_BLOCKED_MESSAGE, isAutomatedRequest } from '@/lib/bot-protection';
import { parseContactMessage } from '@/lib/contact';
import { notifyAdminOfContactMessage } from '@/lib/email';

/**
 * The public contact form. It mails the admin, and it has no authentication
 * and cannot have any: anyone may write to us. So automated traffic is turned
 * away in layers, cheapest-to-fool last:
 *
 *   1. Vercel BotID, which a script posting straight to this URL can't pass.
 *   2. A honeypot field that only form-filling bots see and fill.
 *   3. Volume limits, which cap the damage from anything that gets past both.
 *
 * Booking confirmations used to be sent from here too, to whatever address the
 * caller named. They now come from app/api/bookings, built from a saved booking.
 */
const CONTACT_PER_IP = { limit: 10, windowSeconds: 3600 };
const CONTACT_GLOBAL = { limit: 200, windowSeconds: 3600 };

export async function POST(request: Request) {
  // Before the rate limit, so bot traffic can't spend the budget people share.
  if (await isAutomatedRequest('contact')) {
    return NextResponse.json({ error: BOT_BLOCKED_MESSAGE }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot: a hidden field people never see. A bot that filled it gets the
  // normal reply and nothing is sent.
  if (body.website) return NextResponse.json({ success: true });

  const parsed = parseContactMessage(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ip = requestIp(request) || 'unknown';
  const gate = await checkRateLimits([
    { key: `contact:ip:${ip}`, ...CONTACT_PER_IP },
    { key: 'contact:global', ...CONTACT_GLOBAL },
  ]);
  if (!gate.allowed) {
    console.warn(`[contact] rate limit hit from ${ip}`);
    return NextResponse.json(
      { error: 'Too many requests just now. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(gate) },
    );
  }

  const sent = await notifyAdminOfContactMessage(parsed.value);

  // Here the whole point is delivery — if it failed, tell the sender instead of
  // showing a false "thank you".
  if (!sent.ok) {
    return NextResponse.json(
      { error: 'We could not send your message right now. Please email us directly at info@reparationroad.org.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
