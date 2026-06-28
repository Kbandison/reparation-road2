'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  hasHandle: boolean;
  firstName: string | null;
  lastName: string | null;
}

const SKIP_KEY = 'rr_forum_onboarding_dismissed';
const FIELD =
  'w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg/60 px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none';
const LABEL = 'block text-xs font-medium text-brand-muted mb-1';

// Shows a short welcome flow the first time a signed-in member visits the
// community without a handle. Once they finish or skip, it stays hidden
// (handle presence + a local "dismissed" flag).
export function OnboardingGate({ hasHandle, firstName, lastName }: Props) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState(`${firstName ?? ''} ${lastName ?? ''}`.trim());
  const [surnames, setSurnames] = useState('');
  const [regions, setRegions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHandle) return;
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem(SKIP_KEY);
    } catch {
      dismissed = false;
    }
    if (!dismissed) setShow(true);
  }, [hasHandle]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(SKIP_KEY, '1');
    } catch {
      // ignore
    }
    setShow(false);
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/forum/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: handle.trim().toLowerCase(),
          display_name: displayName,
          research_surnames: surnames.split(',').map((s) => s.trim()).filter(Boolean),
          research_regions: regions.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save your profile.');
        setStep(1); // send them back to the handle step to fix it
        return;
      }
      try {
        localStorage.setItem(SKIP_KEY, '1');
      } catch {
        // ignore
      }
      setShow(false);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-md">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-brand-muted hover:text-brand-cream"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 0 — welcome */}
        {step === 0 && (
          <div className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-brand-gold/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-brand-gold" />
            </div>
            <h2 className="font-display text-xl font-semibold text-brand-cream mb-1.5">
              Welcome to the community
            </h2>
            <p className="text-sm text-brand-muted leading-relaxed mb-5">
              Share discoveries, ask for research help, and connect with fellow researchers. Let&apos;s
              set up your profile — it takes about a minute.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={dismiss} className="text-sm text-brand-muted hover:text-brand-cream transition-colors">
                Skip for now
              </button>
              <Button
                onClick={() => setStep(1)}
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                Get started <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 — identity */}
        {step === 1 && (
          <div className="p-6">
            <p className="text-xs uppercase tracking-wide text-brand-gold/80 mb-1">Step 1 of 2</p>
            <h2 className="font-display text-lg font-semibold text-brand-cream mb-4">Pick your identity</h2>

            <div className="space-y-4">
              <div>
                <label className={LABEL}>Handle</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-brand-muted">@</span>
                  <input
                    className={FIELD}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="yourname"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-brand-muted mt-1">
                  3–20 characters: lowercase letters, numbers, underscores.
                </p>
              </div>

              <div>
                <label className={LABEL}>Display name</label>
                <input
                  className={FIELD}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How your name appears"
                />
              </div>

              {error && <p className="text-xs text-brand-burgundy-light">{error}</p>}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button onClick={dismiss} className="text-sm text-brand-muted hover:text-brand-cream transition-colors">
                Skip for now
              </button>
              <Button
                onClick={() => {
                  setError(null);
                  if (handle.trim().length < 3) {
                    setError('Please choose a handle (at least 3 characters).');
                    return;
                  }
                  setStep(2);
                }}
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                Next <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — research interests */}
        {step === 2 && (
          <div className="p-6">
            <p className="text-xs uppercase tracking-wide text-brand-gold/80 mb-1">Step 2 of 2</p>
            <h2 className="font-display text-lg font-semibold text-brand-cream mb-1">What do you research?</h2>
            <p className="text-sm text-brand-muted mb-4">
              Optional — this helps other researchers find and connect with you.
            </p>

            <div className="space-y-4">
              <div>
                <label className={LABEL}>Surnames you research</label>
                <input
                  className={FIELD}
                  value={surnames}
                  onChange={(e) => setSurnames(e.target.value)}
                  placeholder="Crowell, Perryman"
                />
                <p className="text-[11px] text-brand-muted mt-1">Comma-separated.</p>
              </div>

              <div>
                <label className={LABEL}>Regions you research</label>
                <input
                  className={FIELD}
                  value={regions}
                  onChange={(e) => setRegions(e.target.value)}
                  placeholder="Georgia, Creek Nation"
                />
              </div>

              {error && <p className="text-xs text-brand-burgundy-light">{error}</p>}
            </div>

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="text-sm text-brand-muted hover:text-brand-cream transition-colors"
              >
                Back
              </button>
              <Button
                onClick={finish}
                disabled={saving}
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Finish <Check className="w-4 h-4 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
