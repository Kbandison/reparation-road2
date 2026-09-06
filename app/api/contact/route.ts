import { NextResponse } from 'next/server';
import { Resend, type CreateEmailOptions } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { EMAIL, emailShell, emailSignoff } from '@/lib/email-theme';
import {
  absorbSubscriberRow,
  normalizeEmail,
  recordConsentEvent,
  requestIp,
} from '@/lib/newsletter';

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

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === 'welcome-profile') {
    // Update profile names + donor status (called after user creation)
    if (body.userId) {
      const supabase = createAdminClient();
      const updates: Record<string, unknown> = {
        first_name: body.firstName || null,
        last_name: body.lastName || null,
      };

      // Validate donor code
      const DONOR_CODE = process.env.DONOR_CODE || 'RRDONOR0326';
      if (body.donorCode && body.donorCode.toUpperCase() === DONOR_CODE.toUpperCase()) {
        updates.subscription_status = 'donor';
      }

      await supabase
        .from('profiles')
        .update(updates)
        .eq('id', body.userId);

      // They may already be on the list from the footer form. Collapse the two
      // records before touching consent, so an earlier opt-in isn't overwritten
      // by a later signup where they left the box unticked.
      if (body.email) {
        await absorbSubscriberRow(body.email, body.userId);
      }

      // Newsletter consent is deliberately not implied by having an account.
      // Nothing happens here unless the box on the signup form was ticked.
      //
      // Even then the address is only held as pending: the account's own email
      // is still unverified at this point, and adding an unverified address to
      // the sending audience is how a list fills up with typos. The auth
      // callback completes the subscription once they click the link Supabase
      // sent them.
      if (body.newsletterOptIn === true && body.email) {
        await supabase
          .from('profiles')
          .update({
            newsletter_pending_opt_in: true,
            newsletter_opt_in_source: 'signup_checkbox',
          })
          .eq('id', body.userId);

        // The consent itself happened now, on the signup form — record it with
        // that timestamp rather than the later one, and note what it was
        // waiting on.
        await recordConsentEvent({
          email: normalizeEmail(body.email),
          event: 'subscribed',
          source: 'signup_checkbox',
          profileId: body.userId,
          ip: requestIp(request),
          userAgent: request.headers.get('user-agent'),
          metadata: { pending_email_verification: true },
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  if (body.type === 'welcome') {
    const userName = [body.firstName, body.lastName].filter(Boolean).join(' ') || 'Unknown';

    // Welcome email to user
    const welcomeUser = await sendEmail('welcome-user', {
      from: FROM,
      to: [body.email],
      subject: 'Welcome to Reparation Road!',
      html: emailShell(
        `
          <h1 style="color: ${EMAIL.heading}; font-size: 24px; margin: 0 0 8px;">Welcome to Reparation Road</h1>
          <p style="color: ${EMAIL.strong}; font-size: 16px; margin: 0 0 24px;">Your journey into history begins here.</p>
          <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${body.firstName || 'there'},</p>
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
            Want access to all collections? <a href="https://reparationroad.org/membership" style="color: ${EMAIL.link};">Upgrade to Premium</a> for full access to every record in our archive.
          </p>
        `,
        emailSignoff('https://reparationroad.org'),
      ),
    });

    // Notify owner of new signup
    const welcomeAdmin = await sendEmail('welcome-admin', {
      from: FROM,
      to: [ADMIN_EMAIL],
      subject: `New Signup: ${userName}`,
      html: `
        <h2>New User Signup</h2>
        <p><strong>Name:</strong> ${userName}</p>
        <p><strong>Email:</strong> ${body.email}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
        <p><a href="https://reparationroad.org/admin/users">View in Admin Panel</a></p>
      `,
    });

    // Signup shouldn't fail just because an email didn't send.
    return NextResponse.json({
      success: true,
      emailSent: welcomeUser.ok && welcomeAdmin.ok,
    });
  }

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
