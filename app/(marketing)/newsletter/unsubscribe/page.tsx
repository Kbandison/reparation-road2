'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NewsletterStatus } from '@/components/newsletter/newsletter-status';

/**
 * Landing page for the unsubscribe link in every newsletter.
 *
 * No sign-in and no confirmation step: someone who wants out gets out on the
 * first click. Making people log in to stop receiving mail is what turns an
 * unsubscribe into a spam complaint, which costs far more than the subscriber.
 */
function UnsubscribeInner() {
  const params = useSearchParams();
  const email = params.get('email');
  const token = params.get('token');
  // A link missing either half is already known to be broken before any render.
  const [state, setState] = useState<'working' | 'done' | 'error'>(
    email && token ? 'working' : 'error',
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || !email || !token) return;
    submitted.current = true;

    (async () => {
      try {
        const res = await fetch('/api/newsletter/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token }),
        });
        setState(res.ok ? 'done' : 'error');
      } catch {
        setState('error');
      }
    })();
  }, [email, token]);

  return (
    <NewsletterStatus
      state={state}
      eyebrow="The Road Report"
      workingTitle="Unsubscribing&hellip;"
      title="You're unsubscribed"
      body={
        <p>
          {email ? <strong className="text-brand-cream">{email}</strong> : 'That address'}{' '}
          will no longer receive The Road Report. Your Reparation Road account and
          everything in it are untouched.
        </p>
      }
      errorTitle="We couldn't process that link"
      errorBody={
        <p>
          The link may have been altered in transit. Email{' '}
          <a
            href="mailto:hello@reparationroad.org"
            className="text-brand-gold hover:underline"
          >
            hello@reparationroad.org
          </a>{' '}
          and we&rsquo;ll remove you by hand.
        </p>
      }
    />
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}
