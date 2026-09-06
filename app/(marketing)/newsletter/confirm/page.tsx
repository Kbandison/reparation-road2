'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NewsletterStatus } from '@/components/newsletter/newsletter-status';

/**
 * Landing page for the confirmation link in the double opt-in email.
 *
 * The confirmation is submitted as a POST from the browser rather than acted on
 * during the page request. Corporate mail scanners routinely fetch every link
 * in an incoming message; if a plain GET confirmed the subscription, those
 * scanners would opt people in who never clicked anything.
 */
function ConfirmInner() {
  const token = useSearchParams().get('token');
  // A link with no token is already known to be broken before any render — no
  // need to start in the working state and immediately correct it.
  const [state, setState] = useState<'working' | 'done' | 'error'>(
    token ? 'working' : 'error',
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || !token) return;
    submitted.current = true;

    (async () => {
      try {
        const res = await fetch('/api/newsletter/subscribe', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        setState(res.ok ? 'done' : 'error');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  return (
    <NewsletterStatus
      state={state}
      eyebrow="The Road Report"
      workingTitle="Confirming&hellip;"
      title="You're subscribed"
      body={
        <p>
          Welcome to The Road Report. The first issue will arrive with new records
          from the archive, and a welcome note is on its way now.
        </p>
      }
      errorTitle="That link didn't work"
      errorBody={
        <p>
          Confirmation links expire, and each one can only be used once. Subscribe
          again from the footer of any page and we&rsquo;ll send a fresh link.
        </p>
      }
      action={{ label: 'Browse the collections', href: '/collection' }}
    />
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
