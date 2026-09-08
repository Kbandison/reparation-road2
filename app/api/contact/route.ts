import { NextResponse } from 'next/server';
import { Resend, type CreateEmailOptions } from 'resend';
import { EMAIL, emailShell, emailSignoff } from '@/lib/email-theme';
import { checkRateLimits, rateLimitHeaders } from '@/lib/rate-limit';
import { requestIp } from '@/lib/newsletter';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Reparation Road <noreply@reparationroad.org>';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'admin@reparationroad.org';

// Send an email and surface failures. The Resend SDK returns { data, error }
// (it does NOT throw on API errors like an unverified domain or a bad key), so
// without this the emails fail silently and the route still reports success.
async function sendEmail(
  label: string,
  opts: CreateEmailOptions,
): Promise<{ ok: boolean; error?: string }> {
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

/**
 * Limits for the public mail endpoint.
 *
 * This route has no authentication and cannot have any: the welcome email is
 * sent before the account exists, so there is nobody to authenticate yet. That
 * makes it a relay — anyone can ask it to send Reparation Road mail to an
 * address of their choosing, from the same domain that carries password resets
 * and receipts. Abuse would take those down with it.
 *
 * Volume is the only lever available, so it is the one used.
 */
const CONTACT_PER_IP = { limit: 10, windowSeconds: 3600 };
const CONTACT_GLOBAL = { limit: 200, windowSeconds: 3600 };

export async function POST(request: Request) {
  const gate = await checkRateLimits([
    { key: `contact:ip:${requestIp(request) || 'unknown'}`, ...CONTACT_PER_IP },
    { key: 'contact:global', ...CONTACT_GLOBAL },
  ]);

  if (!gate.allowed) {
    console.warn(`[contact] rate limit hit from ${requestIp(request) || 'unknown'}`);
    return NextResponse.json(
      { error: 'Too many requests just now. Please try again shortly.' },
      { status: 429, headers: rateLimitHeaders(gate) },
    );
  }

  const body = await request.json();

  // 'welcome' and 'welcome-profile' used to live here. Both are gone rather
  // than fixed: one wrote to a profile id supplied by the caller, and the other
  // mailed an address supplied by the caller, neither with any authentication.
  // Account setup now happens in app/(auth)/auth/callback, which has a real
  // session and therefore does not have to take the caller's word for who they
  // are. Nothing that remains here can write to a user record.

  if (body.type === 'booking') {
    // Booking confirmation email to user
    const bookingUser = await sendEmail('booking-user', {
      from: FROM,
      to: [body.email],
      subject: 'Your Research Session is Booked',
      html: emailShell(
        `
          <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Your Session Is Booked</h1>
          <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">We&rsquo;re looking forward to it.</p>

          <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${body.name},</p>
          <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">
            Your research session is confirmed. Here are the details:
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 22px 0; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.muted}; font-size: 13px; width: 40%;">Session</td>
              <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${body.sessionType}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.muted}; font-size: 13px;">Date</td>
              <td style="padding: 10px 0; border-bottom: 1px solid ${EMAIL.rule}; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${body.date}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: ${EMAIL.muted}; font-size: 13px;">Time</td>
              <td style="padding: 10px 0; color: ${EMAIL.strong}; font-size: 14px; font-weight: bold;">${body.time}</td>
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

    // Notify owner of new booking
    const bookingAdmin = await sendEmail('booking-admin', {
      from: FROM,
      to: [ADMIN_EMAIL],
      subject: `New Booking: ${body.name} — ${body.sessionType}`,
      html: `
        <h2>New Appointment Booked</h2>
        <p><strong>Name:</strong> ${body.name}</p>
        <p><strong>Email:</strong> ${body.email}</p>
        <p><strong>Session:</strong> ${body.sessionType}</p>
        <p><strong>Date:</strong> ${body.date}</p>
        <p><strong>Time:</strong> ${body.time}</p>
        <p><a href="https://reparationroad.org/admin/bookings">View in Admin Panel</a></p>
      `,
    });

    if (!bookingAdmin.ok) {
      console.error(
        `[booking] Admin was NOT notified of booking by ${body.name} <${body.email}> for ${body.sessionType} on ${body.date} ${body.time}: ${bookingAdmin.error}`,
      );
    }

    // The booking itself is already saved; report whether the notifications went out.
    return NextResponse.json({
      success: true,
      confirmationSent: bookingUser.ok,
      adminNotified: bookingAdmin.ok,
    });
  }

  // Contact form email
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const contact = await sendEmail('contact', {
    from: FROM,
    to: [ADMIN_EMAIL],
    replyTo: email,
    subject: `New Contact Form: ${name}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p><p>${String(message).replace(/\n/g, '<br/>')}</p>`,
  });

  // Here the whole point is delivery — if it failed, tell the sender instead of
  // showing a false "thank you".
  if (!contact.ok) {
    return NextResponse.json(
      { error: 'We could not send your message right now. Please email us directly at info@reparationroad.org.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
