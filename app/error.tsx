'use client';

import { Button } from '@/components/ui/button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-4xl font-semibold text-brand-cream mb-2">Something went wrong</h1>
      <p className="text-brand-muted text-sm mb-8 max-w-md">
        An unexpected error occurred. Please try again.
      </p>
      <Button
        onClick={reset}
        className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
      >
        Try Again
      </Button>
    </div>
  );
}
