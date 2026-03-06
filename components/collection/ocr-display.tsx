'use client';

import { useUser } from '@/contexts/user-context';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface OcrDisplayProps {
  text: string;
}

export function OcrDisplay({ text }: OcrDisplayProps) {
  const { isPremium } = useUser();

  if (!isPremium) {
    return (
      <div className="relative">
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 max-h-48 overflow-hidden">
          <h3 className="font-display text-lg font-semibold text-brand-cream mb-3">Transcription</h3>
          <p className="font-body text-sm text-brand-muted leading-relaxed blur-sm select-none">
            {text.slice(0, 500)}
          </p>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-brand-card via-brand-card/80 to-transparent rounded-2xl flex flex-col items-center justify-center">
          <Lock className="w-8 h-8 text-brand-gold mb-3" />
          <p className="font-display text-lg font-semibold text-brand-cream mb-2">
            Premium Content
          </p>
          <p className="text-sm text-brand-muted mb-4 text-center max-w-sm">
            Upgrade to Premium to view full transcriptions
          </p>
          <Link href="/membership">
            <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
              Upgrade Now
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold text-brand-cream mb-3">Transcription</h3>
      <div className="font-serif text-sm text-brand-cream-muted leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
