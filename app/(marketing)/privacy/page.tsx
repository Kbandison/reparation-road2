import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Reparation Road.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-brand-bg pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link
          href="/"
          className="text-sm text-brand-muted hover:text-brand-gold transition-colors mb-8 inline-block"
        >
          &larr; Back to Home
        </Link>

        <h1 className="font-display text-4xl font-semibold text-brand-cream mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-brand-muted mb-10">
          Last updated: April 12, 2026
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-brand-cream/80 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Introduction
            </h2>
            <p>
              Reparation Road (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit
              our website and use our services.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Information We Collect
            </h2>
            <p className="mb-3">We may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong className="text-brand-cream">Account Information:</strong> Name, email address, and password when you create an account.</li>
              <li><strong className="text-brand-cream">Payment Information:</strong> Payment details are processed securely by Stripe. We do not store your credit card information.</li>
              <li><strong className="text-brand-cream">Usage Data:</strong> Information about how you use our site, including records viewed, searches performed, and bookmarks saved.</li>
              <li><strong className="text-brand-cream">Communications:</strong> Messages you send through our contact form, forum posts, and session booking requests.</li>
              <li><strong className="text-brand-cream">Authentication Data:</strong> If you sign in via third-party providers (Google), we receive basic profile information from that provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              How We Use Your Information
            </h2>
            <p className="mb-3">We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and maintain our services</li>
              <li>Process transactions and manage subscriptions</li>
              <li>Send you account-related notifications (welcome emails, booking confirmations, subscription updates)</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Improve our site and services</li>
              <li>Prevent fraud and protect our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Information Sharing
            </h2>
            <p>
              We do not sell, trade, or rent your personal information. We may share your information only with:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong className="text-brand-cream">Service Providers:</strong> Stripe (payments), Supabase (database & authentication), Resend (email delivery), Vercel (hosting).</li>
              <li><strong className="text-brand-cream">Legal Requirements:</strong> If required by law or to protect our rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Your Rights
            </h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access and review your personal data</li>
              <li>Update or correct your information via your account settings</li>
              <li>Delete your account and associated data</li>
              <li>Opt out of non-essential email communications</li>
              <li>Cancel your subscription at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Data Security
            </h2>
            <p>
              We implement industry-standard security measures to protect your data, including encrypted connections (HTTPS),
              secure password storage, and protected database access. However, no method of transmission over the internet
              is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Cookies
            </h2>
            <p>
              We use cookies for authentication and session management. You may disable cookies in your browser, but this
              may affect your ability to use our services.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Children&apos;s Privacy
            </h2>
            <p>
              Our services are not intended for children under 13. We do not knowingly collect personal information from
              children under 13.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes by posting
              the new policy on this page with a revised date.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Contact Us
            </h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:admin@reparationroad.org" className="text-brand-gold hover:text-brand-gold-light">
                admin@reparationroad.org
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
