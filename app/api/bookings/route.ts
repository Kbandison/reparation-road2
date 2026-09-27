import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimits, rateLimitHeaders } from '@/lib/rate-limit';
import { requestIp } from '@/lib/newsletter';
import { BOT_BLOCKED_MESSAGE, isAutomatedRequest } from '@/lib/bot-protection';
import { parseBookingRequest, utcDateString } from '@/lib/bookings';
import { notifyAdminOfBooking, sendBookingConfirmation } from '@/lib/email';

/**
 * Research-session bookings.
 *
 * Bookings are created here rather than straight from the browser, so every
 * one passes the same bot check, honeypot and rate limit as the contact form,
 * is validated against the real sessions and time slots, and gets its
 * confirmation email built from what was actually saved. The page used to
 * insert the row itself and then ask /api/contact to email any address it
 * named; that relay is gone.
 */
const BOOKING_PER_IP = { limit: 5, windowSeconds: 3600 };
const BOOKING_GLOBAL = { limit: 50, windowSeconds: 3600 };

const SLOT_TAKEN = 'That time was just booked. Please pick another.';

/**
 * Slots already taken from yesterday (UTC) on, so the calendar can grey them
 * out. Dates and times only: who booked stays private. Bookings RLS only lets
 * people read their own rows, so the page can't work this out by itself.
 */
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('date, time')
    .gte('date', utcDateString(new Date(), -1));
  if (error) {
    console.error('[booking] could not load taken slots:', error);
    return NextResponse.json({ error: 'Could not load availability' }, { status: 500 });
  }
  return NextResponse.json({ taken: data ?? [] });
}

export async function POST(request: Request) {
  // Before the rate limit, so bot traffic can't spend the budget people share.
  if (await isAutomatedRequest('booking')) {
    return NextResponse.json({ error: BOT_BLOCKED_MESSAGE }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Honeypot: a bot that filled the hidden field gets the normal reply and nothing is saved.
  if (body.website) return NextResponse.json({ success: true, confirmationSent: true });

  const parsed = parseBookingRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const booking = parsed.value;

  const ip = requestIp(request) || 'unknown';
  const gate = await checkRateLimits([
    { key: `booking:ip:${ip}`, ...BOOKING_PER_IP },
    { key: 'booking:global', ...BOOKING_GLOBAL },
  ]);
  if (!gate.allowed) {
    console.warn(`[booking] rate limit hit from ${ip}`);
    return NextResponse.json(
      { error: 'Too many bookings from here just now. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(gate) },
    );
  }

  const supabase = createAdminClient();

  // The unique index on (date, time) is the real guard against two people
  // taking one slot (bookings_lockdown.sql); this read answers the common case
  // clearly, and is the only guard until that index exists.
  const { data: clash } = await supabase
    .from('bookings')
    .select('id')
    .eq('date', booking.date)
    .eq('time', booking.time)
    .limit(1);
  if (clash && clash.length > 0) return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });

  const { error } = await supabase.from('bookings').insert({
    name: booking.name,
    email: booking.email,
    message: booking.message,
    session_type: booking.sessionType,
    date: booking.date,
    time: booking.time,
  });
  if (error) {
    // 23505 = unique_violation: someone took the slot between the check and the insert.
    if (error.code === '23505') return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
    console.error('[booking] insert failed:', error);
    return NextResponse.json(
      { error: 'We could not save your booking. Please try again, or email us at info@reparationroad.org.' },
      { status: 500 },
    );
  }

  const [confirmation, admin] = await Promise.all([
    sendBookingConfirmation(booking),
    notifyAdminOfBooking(booking),
  ]);
  if (!admin.ok) {
    console.error(
      `[booking] Admin was NOT notified of booking by ${booking.name} <${booking.email}> for ${booking.sessionType} on ${booking.date} ${booking.time}: ${admin.error}`,
    );
  }

  // The booking is saved either way; report whether the emails went out.
  return NextResponse.json({ success: true, confirmationSent: confirmation.ok, adminNotified: admin.ok });
}
