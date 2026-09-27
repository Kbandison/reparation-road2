import { availableTimeSlots, bookingSessionTypes } from '@/lib/constants';
import { isValidEmail } from '@/lib/newsletter';

// Server-only (lib/newsletter pulls in the admin client). The booking page
// shares the plain lists in lib/constants instead.

export interface BookingRequest {
  sessionType: string;
  name: string;
  email: string;
  message: string | null;
  date: string; // YYYY-MM-DD
  time: string;
}

const MAX = { name: 200, email: 254, message: 2000 };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (so 2026-02-30 is rejected). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The UTC calendar date `days` away from `now`, as YYYY-MM-DD. */
export function utcDateString(now: Date, days = 0): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Checks a booking request from the page and returns what gets saved, or the
 * reason it can't be booked. The session is sent as an id and stored under
 * its canonical name, so the stored text can't be anything the caller likes.
 */
export function parseBookingRequest(
  body: Record<string, unknown>,
  now = new Date(),
): { ok: true; value: BookingRequest } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const sessionId = text(body.sessionId);
  const sessionType = Object.hasOwn(bookingSessionTypes, sessionId)
    ? bookingSessionTypes[sessionId as keyof typeof bookingSessionTypes]
    : null;
  if (!sessionType) return { ok: false, error: 'Choose a session.' };

  const name = text(body.name).replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Enter your name.' };
  if (name.length > MAX.name) return { ok: false, error: 'That name is too long.' };

  const email = text(body.email);
  if (email.length > MAX.email || !isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };

  const message = text(body.message);
  if (message.length > MAX.message) {
    return { ok: false, error: `Please keep your notes under ${MAX.message.toLocaleString('en-US')} characters.` };
  }

  // The calendar only offers days after today. A day of slack covers visitors
  // whose "today" is already tomorrow in UTC.
  const date = text(body.date);
  if (!isCalendarDate(date) || date < utcDateString(now, -1)) return { ok: false, error: 'Pick a date from the calendar.' };

  const time = text(body.time);
  if (!(availableTimeSlots as readonly string[]).includes(time)) return { ok: false, error: 'Pick one of the listed times.' };

  return { ok: true, value: { sessionType, name, email, message: message || null, date, time } };
}
