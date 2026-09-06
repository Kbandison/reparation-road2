'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Newsletter signup for visitors with no account.
 *
 * Asks for an email and nothing else — every extra field costs signups, and the
 * name can be collected later. Nothing is sent until the address is confirmed,
 * so the success state promises a confirmation email rather than a subscription.
 */
export function NewsletterSignup({
  className = '',
  variant = 'stacked',
}: {
  className?: string;
  /** 'banner' lays the pitch and the form side by side across a full-width row. */
  variant?: 'stacked' | 'banner';
}) {
  const banner = variant === 'banner';
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('sending');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }

      setStatus('sent');
      setEmail('');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  const pitch = (
    <div>
      <h4 className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
        The Road Report
      </h4>
      <p
        className={
          banner
            ? 'font-display text-xl text-brand-cream leading-snug'
            : 'text-sm text-brand-muted leading-relaxed'
        }
      >
        New records, research tips, and stories from the archive.
      </p>
      {banner && (
        <p className="text-sm text-brand-muted leading-relaxed mt-2">
          Sent as we uncover them. No account needed.
        </p>
      )}
    </div>
  );

  if (status === 'sent') {
    return (
      <div
        className={
          banner
            ? `grid gap-6 md:grid-cols-2 md:items-center ${className}`
            : className
        }
      >
        {pitch}
        <p className="flex items-start gap-2 text-sm text-brand-cream">
          <Check className="w-4 h-4 text-brand-sage shrink-0 mt-0.5" />
          <span>Check your inbox for a link to confirm your subscription.</span>
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        banner
          ? `grid gap-6 md:grid-cols-2 md:items-center ${className}`
          : className
      }
    >
      {pitch}
      <form onSubmit={handleSubmit} className={banner ? 'space-y-2.5' : 'space-y-2.5 mt-4'}>
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <div className={banner ? 'flex flex-col sm:flex-row gap-2.5' : 'contents'}>
          <Input
            id="newsletter-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold rounded-xl"
          />
          <Button
            type="submit"
            disabled={status === 'sending'}
            className={`bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl ${
              banner ? 'sm:w-auto sm:px-7 shrink-0' : 'w-full'
            }`}
          >
            {status === 'sending' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Subscribe'
            )}
          </Button>
        </div>

        {/* Not a real field. Left visible only to automated form fillers. */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="newsletter-website">Website</label>
          <input
            id="newsletter-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-brand-burgundy-light">
            {error}
          </p>
        )}

        <p className="text-[11px] text-brand-muted/70 leading-relaxed">
          We&rsquo;ll send a confirmation link first. Unsubscribe any time.
        </p>
      </form>
    </div>
  );
}
