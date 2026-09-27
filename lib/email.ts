import { Resend, type CreateEmailOptions } from 'resend';
import { EMAIL, emailShell, emailSignoff } from '@/lib/email-theme';
import { escapeHtml, textToHtml } from '@/lib/html';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Reparation Road <noreply@reparationroad.org>';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'admin@reparationroad.org';

// Anything a visitor typed is escaped before it goes into an email's HTML:
// these go to the admin's inbox, where injected links would carry our name.

/**
 * Sends one email and reports whether it went. The Resend SDK returns
 * { data, error } rather than throwing on API errors (an unverified domain, a
 * bad key), so without this a failure would pass as success.
 */
async function send(label: string, opts: CreateEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error(`[email:${label}] RESEND_API_KEY is not set — email not sent`);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await resend.emails.send(opts);
    if (error) {
      console.error(`[email:${label}] Resend error sending to ${JSON.stringify(opts.to)}:`, error);
      return { ok: false, error: (error as { message?: string }).message || 'send failed' };
    }
    console.log(`[email:${label}] sent to ${JSON.stringify(opts.to)}${data?.id ? ` (id ${data.id})` : ''}`);
    return { ok: true };
  } catch (e) {
    console.error(`[email:${label}] threw sending to ${JSON.stringify(opts.to)}:`, e);
    return { ok: false, error: e instanceof Error ? e.message : 'send threw' };
  }
}

export async function sendMembershipEmail(
  email: string,
  firstName?: string | null,
  interval?: 'month' | 'year' | null
) {
  const name = escapeHtml(firstName || 'there');
  const planName = interval === 'year' ? 'Premium Yearly' : 'Premium Monthly';

  await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Welcome to Reparation Road Premium!',
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">You&rsquo;re Now a Premium Member</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Full access to the Reparation Road archive is yours.</p>

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Hi ${name},
        </p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Thank you for subscribing to the <strong style="color: ${EMAIL.strong};">${planName}</strong> plan. Your support helps us preserve and digitize historical records for future generations.
        </p>

        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 24px 0 12px;">
          Your premium benefits:
        </p>
        <ul style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.8; padding-left: 20px;">
          <li>Full access to all historical collections and records</li>
          <li>Advanced search and filtering across the entire archive</li>
          <li>Download and export records for your research</li>
          <li>Priority customer support</li>
          <li>Early access to new collections as they are added</li>
          <li>Priority booking for research consultations</li>
        </ul>

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin-top: 24px;">
          Start exploring: <a href="https://reparationroad.org/collection" style="color: ${EMAIL.link}; text-decoration: underline;">Browse all collections</a>
        </p>

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          You can manage your subscription anytime from your <a href="https://reparationroad.org/dashboard/settings" style="color: ${EMAIL.link}; text-decoration: underline;">account settings</a>.
        </p>
      `,
      emailSignoff('https://reparationroad.org'),
    ),
  });
}


/**
 * Welcome email for a newly confirmed account.
 *
 * Sent from the auth callback rather than the browser, so the recipient is
 * whoever actually owns the verified session — not an address supplied by
 * whoever called the endpoint.
 */
export async function sendAccountWelcomeEmail(email: string, firstName?: string | null) {
  if (!process.env.RESEND_API_KEY) {
    console.error('[email:welcome] RESEND_API_KEY is not set — email not sent');
    return { ok: false };
  }
  const { error } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject: 'Welcome to Reparation Road!',
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Welcome to Reparation Road</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Your journey into history begins here.</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${escapeHtml(firstName || 'there')},</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Thank you for creating an account with Reparation Road. You now have access to our growing digital archive of historical records documenting the African American experience.
        </p>
        <p style="color: ${EMAIL.strong}; font-size: 14px; font-weight: bold; margin: 24px 0 12px;">Here&rsquo;s what you can do:</p>
        <ul style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.8; padding-left: 20px;">
          <li>Browse our free collections of census, military, and church records</li>
          <li>Search across all collections by name, location, or keyword</li>
          <li>Bookmark records and build your research library</li>
          <li>Join our community forum to connect with other researchers</li>
        </ul>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6; margin-top: 24px;">
          Want access to all collections? <a href="https://www.reparationroad.org/membership" style="color: ${EMAIL.link};">Upgrade to Premium</a> for full access to every record in our archive.
        </p>
      `,
      emailSignoff('https://www.reparationroad.org'),
    ),
  });
  if (error) {
    console.error(`[email:welcome] Resend error sending to ${email}:`, error);
    return { ok: false };
  }
  return { ok: true };
}

/** Tell the owner someone signed up. */
export async function notifyAdminOfSignup(email: string, name: string) {
  if (!process.env.RESEND_API_KEY) return { ok: false };
  const { error } = await resend.emails.send({
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: `New Signup: ${name}`,
    html: `
      <h2>New User Signup</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      <p><a href="https://www.reparationroad.org/admin/users">View in Admin Panel</a></p>
    `,
  });
  return { ok: !error };
}

/** A contact form message, to the admin; replying answers the sender. */
export async function notifyAdminOfContactMessage(msg: { name: string; email: string; message: string }) {
  return send('contact', {
    from: FROM,
    to: [ADMIN_EMAIL],
    replyTo: msg.email,
    subject: `New Contact Form: ${msg.name}`,
    html: `<p><strong>From:</strong> ${escapeHtml(msg.name)} (${escapeHtml(msg.email)})</p><p>${textToHtml(msg.message)}</p>`,
  });
}

export interface BookingDetails {
  name: string;
  email: string;
  sessionType: string;
  date: string; // YYYY-MM-DD
  time: string;
  message: string | null;
}

/** "2026-10-05" → "Monday, October 5, 2026". Read as UTC so the day can't shift. */
function formatBookingDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Confirmation to the person who booked, built from the saved booking. */
export async function sendBookingConfirmation(b: BookingDetails) {
  return send('booking-user', {
    from: FROM,
    to: [b.email],
    // The email invites a reply, and noreply@ would swallow it.
    replyTo: 'info@reparationroad.org',
    subject: 'Your Research Session is Booked',
    html: emailShell(
      `
        <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Your Session Is Booked</h1>
        <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">We&rsquo;re looking forward to it.</p>

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${escapeHtml(b.name)},</p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Your research session is confirmed. Here are the details:
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 22px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.muted}; font-size: 13px; width: 40%;">Session</td>
            <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${escapeHtml(b.sessionType)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.muted}; font-size: 13px;">Date</td>
            <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${formatBookingDate(b.date)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: ${EMAIL.muted}; font-size: 13px;">Time</td>
            <td style="padding: 10px 0; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${escapeHtml(b.time)}</td>
          </tr>
        </table>

        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Come with whatever you already have &mdash; names, dates, places, family stories, documents.
          Even fragments give us somewhere to start.
        </p>
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
          Need to reschedule or cancel? Just reply to this email and we&rsquo;ll sort it out.
        </p>
      `,
      emailSignoff('https://www.reparationroad.org'),
    ),
  });
}

/** Tell the owner about a new booking; replying answers the person who booked. */
export async function notifyAdminOfBooking(b: BookingDetails) {
  return send('booking-admin', {
    from: FROM,
    to: [ADMIN_EMAIL],
    replyTo: b.email,
    subject: `New Booking: ${b.name} — ${b.sessionType}`,
    html: `
      <h2>New Appointment Booked</h2>
      <p><strong>Name:</strong> ${escapeHtml(b.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(b.email)}</p>
      <p><strong>Session:</strong> ${escapeHtml(b.sessionType)}</p>
      <p><strong>Date:</strong> ${formatBookingDate(b.date)}</p>
      <p><strong>Time:</strong> ${escapeHtml(b.time)}</p>
      ${b.message ? `<p><strong>Notes:</strong><br/>${textToHtml(b.message)}</p>` : ''}
      <p><a href="https://reparationroad.org/admin/bookings">View in Admin Panel</a></p>
    `,
  });
}
