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
