import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Reparation Road <noreply@reparationroad.org>';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'admin@reparationroad.org';

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === 'welcome-profile') {
    // Just update profile names (called after user creation)
    if (body.userId) {
      const supabase = createAdminClient();
      await supabase
        .from('profiles')
        .update({ first_name: body.firstName || null, last_name: body.lastName || null })
        .eq('id', body.userId);
    }
    return NextResponse.json({ success: true });
  }

  if (body.type === 'welcome') {
    const userName = [body.firstName, body.lastName].filter(Boolean).join(' ') || 'Unknown';

    // Welcome email to user
    await resend.emails.send({
      from: FROM,
      to: [body.email],
      subject: 'Welcome to Reparation Road!',
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0F0D0B; padding: 32px; border-radius: 16px;">
            <h1 style="color: #C8956C; font-size: 24px; margin: 0 0 8px;">Welcome to Reparation Road</h1>
            <p style="color: #F5F0E8; font-size: 16px; margin: 0 0 24px;">Your journey into history begins here.</p>
            <p style="color: #A8A29E; font-size: 14px; line-height: 1.6;">Hi ${body.firstName || 'there'},</p>
            <p style="color: #A8A29E; font-size: 14px; line-height: 1.6;">
              Thank you for creating an account with Reparation Road. You now have access to our growing digital archive of historical records documenting the African American experience.
            </p>
            <p style="color: #F5F0E8; font-size: 14px; font-weight: bold; margin: 24px 0 12px;">Here&rsquo;s what you can do:</p>
            <ul style="color: #A8A29E; font-size: 14px; line-height: 1.8; padding-left: 20px;">
              <li>Browse our free collections of census, military, and church records</li>
              <li>Search across all collections by name, location, or keyword</li>
              <li>Bookmark records and build your research library</li>
              <li>Join our community forum to connect with other researchers</li>
            </ul>
            <p style="color: #A8A29E; font-size: 14px; line-height: 1.6; margin-top: 24px;">
              Want access to all collections? <a href="https://reparationroad.org/membership" style="color: #C8956C;">Upgrade to Premium</a> for full access to every record in our archive.
            </p>
            <div style="border-top: 1px solid #C8956C33; margin-top: 32px; padding-top: 20px;">
              <p style="color: #A8A29E; font-size: 12px; margin: 0;">
                &mdash; The Reparation Road Team<br/>
                <a href="https://reparationroad.org" style="color: #C8956C; text-decoration: none;">reparationroad.org</a>
              </p>
            </div>
          </div>
        </div>
      `,
    });

    // Notify owner of new signup
    await resend.emails.send({
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

    return NextResponse.json({ success: true });
  }

  if (body.type === 'booking') {
    // Booking confirmation email to user
    await resend.emails.send({
      from: FROM,
      to: [body.email],
      subject: 'Your Research Session is Booked!',
      html: `
        <h2>Booking Confirmed</h2>
        <p>Hi ${body.name},</p>
        <p>Your <strong>${body.sessionType}</strong> session has been booked for <strong>${body.date}</strong> at <strong>${body.time}</strong>.</p>
        <p>We look forward to helping you discover your history.</p>
        <p>&mdash; The Reparation Road Team</p>
      `,
    });

    // Notify owner of new booking
    await resend.emails.send({
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

    return NextResponse.json({ success: true });
  }

  // Contact form email
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  await resend.emails.send({
    from: FROM,
    to: [ADMIN_EMAIL],
    subject: `New Contact Form: ${name}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message}</p>`,
  });

  return NextResponse.json({ success: true });
}
