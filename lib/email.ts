import { Resend } from 'resend';
import { EMAIL, emailShell, emailSignoff } from '@/lib/email-theme';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Reparation Road <noreply@reparationroad.org>';

export async function sendMembershipEmail(
  email: string,
  firstName?: string | null,
  interval?: 'month' | 'year' | null
) {
  const name = firstName || 'there';
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
        <p style="color: ${EMAIL.text}; font-size: 14px; line-height: 1.6;">Hi ${firstName || 'there'},</p>
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
    to: [process.env.ADMIN_NOTIFY_EMAIL || 'admin@reparationroad.org'],
    subject: `New Signup: ${name}`,
    html: `
      <h2>New User Signup</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
      <p><a href="https://www.reparationroad.org/admin/users">View in Admin Panel</a></p>
    `,
  });
  return { ok: !error };
}
