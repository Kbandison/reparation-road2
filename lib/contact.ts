import { isValidEmail } from '@/lib/newsletter';

// Server-only (lib/newsletter pulls in the admin client).

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

const MAX = { name: 200, email: 254, message: 5000 };

/** Checks a contact form submission and returns it trimmed, or the reason it can't be sent. */
export function parseContactMessage(
  body: Record<string, unknown>,
): { ok: true; value: ContactMessage } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  // A name is one line; this also keeps it safe to use in a subject line.
  const name = text(body.name).replace(/\s+/g, ' ');
  const email = text(body.email);
  const message = text(body.message);

  if (!name || !email || !message) return { ok: false, error: 'All fields are required' };
  if (name.length > MAX.name) return { ok: false, error: 'That name is too long.' };
  if (email.length > MAX.email || !isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (message.length > MAX.message) {
    return { ok: false, error: `Please keep your message under ${MAX.message.toLocaleString('en-US')} characters.` };
  }
  return { ok: true, value: { name, email, message } };
}
