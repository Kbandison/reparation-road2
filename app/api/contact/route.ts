import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === 'booking') {
    // Booking confirmation email
    await resend.emails.send({
      from: 'Reparation Road <onboarding@resend.dev>',
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

    return NextResponse.json({ success: true });
  }

  // Contact form email
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  await resend.emails.send({
    from: 'Reparation Road <onboarding@resend.dev>',
    to: ['admin@reparationroad.org'],
    subject: `New Contact Form: ${name}`,
    html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message}</p>`,
  });

  return NextResponse.json({ success: true });
}
