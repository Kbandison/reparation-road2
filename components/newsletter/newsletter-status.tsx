'use client';

import Link from 'next/link';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shared frame for the confirm and unsubscribe landing pages. */
export function NewsletterStatus({
  state,
  eyebrow,
  workingTitle,
  title,
  body,
  errorTitle,
  errorBody,
  action,
}: {
  state: 'working' | 'done' | 'error';
  eyebrow: string;
  workingTitle: string;
  title: string;
  body: React.ReactNode;
  errorTitle: string;
  errorBody: React.ReactNode;
  action?: { label: string; href: string };
}) {
  const failed = state === 'error';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-brand-gold/20 bg-brand-card">
          {state === 'working' && (
            <Loader2 className="h-6 w-6 animate-spin text-brand-gold" />
          )}
          {state === 'done' && <Check className="h-6 w-6 text-brand-sage" />}
          {failed && <AlertCircle className="h-6 w-6 text-brand-burgundy-light" />}
        </div>

        <p className="font-body text-xs font-semibold uppercase tracking-widest text-brand-gold mb-3">
          {eyebrow}
        </p>

        <h1 className="font-display text-3xl font-semibold text-brand-cream mb-4">
          {state === 'working' ? workingTitle : failed ? errorTitle : title}
        </h1>

        <div className="text-brand-muted leading-relaxed">
          {state === 'working' ? null : failed ? errorBody : body}
        </div>

        {state !== 'working' && (
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {!failed && action && (
              <Button
                asChild
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="border-brand-gold/25 text-brand-cream rounded-xl"
            >
              <Link href="/">Back to Reparation Road</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
