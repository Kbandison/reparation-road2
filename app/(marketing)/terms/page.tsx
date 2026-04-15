import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Reparation Road.',
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-brand-muted mb-10">
          Last updated: April 12, 2026
        </p>

        <div className="prose prose-invert max-w-none space-y-6 text-brand-cream/80 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Acceptance of Terms
            </h2>
            <p>
              By accessing or using Reparation Road (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Description of Service
            </h2>
            <p>
              Reparation Road is a digital archive providing access to historical records documenting the African American
              experience. We offer free and premium tiers, community forums, and research consultation services.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              User Accounts
            </h2>
            <p className="mb-3">To access certain features, you must create an account. You agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your password</li>
              <li>Be responsible for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized access</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Subscription & Billing
            </h2>
            <p className="mb-3">Premium membership is billed on a recurring basis (monthly or annually). By subscribing, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Pay all applicable fees</li>
              <li>Automatic renewal unless cancelled</li>
              <li>Our right to modify pricing with notice</li>
            </ul>
            <p className="mt-3">
              You may cancel your subscription at any time through your account settings. Cancellation takes effect at the
              end of the current billing period. No refunds for partial periods.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Intellectual Property
            </h2>
            <p>
              The content on Reparation Road, including historical records, descriptions, images, and site design, is the
              property of Reparation Road or its content suppliers and is protected by copyright and other intellectual
              property laws. Historical records may be in the public domain but our curation, transcription, and presentation
              are protected.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Acceptable Use
            </h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Copy, redistribute, or commercially exploit content without permission</li>
              <li>Use automated tools to scrape or download content in bulk</li>
              <li>Attempt to circumvent access restrictions or security measures</li>
              <li>Post offensive, illegal, or infringing content in the forum</li>
              <li>Impersonate others or misrepresent your affiliation</li>
              <li>Interfere with the Service or other users&apos; use of it</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Forum & User Content
            </h2>
            <p>
              You retain ownership of content you post in the forum. By posting, you grant us a worldwide, non-exclusive
              license to display, distribute, and archive your content. We reserve the right to remove content that violates
              these Terms or our community guidelines.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Research Sessions
            </h2>
            <p>
              Booked research consultation sessions are subject to availability. We reserve the right to reschedule or
              cancel sessions due to unforeseen circumstances. Cancellations by users must be made at least 24 hours in
              advance for a refund (if applicable).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Donor Codes
            </h2>
            <p>
              Donor codes grant complimentary premium access and are non-transferable. Misuse or sharing of donor codes
              may result in account suspension.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not guarantee the accuracy,
              completeness, or reliability of historical records. Users should independently verify information for
              genealogical or legal purposes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by law, Reparation Road shall not be liable for any indirect, incidental,
              consequential, or punitive damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violations of these Terms. You may
              delete your account at any time. Upon termination, your right to use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Changes to Terms
            </h2>
            <p>
              We may modify these Terms at any time. Continued use of the Service after changes constitutes acceptance.
              Material changes will be announced on this page with a revised date.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Governing Law
            </h2>
            <p>
              These Terms are governed by the laws of the United States. Any disputes shall be resolved in the courts of
              the applicable jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-brand-cream mt-8 mb-3">
              Contact
            </h2>
            <p>
              Questions about these Terms? Email us at{' '}
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
