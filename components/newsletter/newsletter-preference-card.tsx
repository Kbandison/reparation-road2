'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * The newsletter toggle in account settings.
 *
 * This is the whole point of keeping newsletter consent separate from account
 * status: turning it off here stops the mail and touches nothing else — not the
 * account, not the membership, not billing.
 */
export function NewsletterPreferenceCard() {
  const [status, setStatus] = useState<'subscribed' | 'unsubscribed' | 'cleaned' | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/newsletter/preferences');
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
      } catch {
        // Leave the card in its loading state rather than showing a wrong value.
      }
    })();
  }, []);

  async function handleChange(next: boolean) {
    const previous = status;
    setStatus(next ? 'subscribed' : 'unsubscribed');
    setSaving(true);

    try {
      const res = await fetch('/api/newsletter/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed: next }),
      });

      if (!res.ok) {
        setStatus(previous);
        toast.error('Could not save your preference');
        return;
      }

      const data = await res.json();
      setStatus(data.status);
      toast.success(
        next ? 'Subscribed to The Road Report' : 'Unsubscribed from The Road Report',
      );
    } catch {
      setStatus(previous);
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-brand-cream">
          Email Preferences
        </h2>
        <p className="text-xs text-brand-muted mt-0.5">
          Separate from your account. Turning this off keeps everything else exactly
          as it is.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="newsletter-opt-in"
          checked={status === 'subscribed'}
          disabled={status === null || saving}
          onCheckedChange={(checked) => handleChange(checked === true)}
          className="mt-0.5 border-brand-gold/40 data-[state=checked]:bg-brand-gold data-[state=checked]:border-brand-gold data-[state=checked]:text-brand-bg"
        />
        <label htmlFor="newsletter-opt-in" className="cursor-pointer">
          <span className="block text-sm text-brand-cream">
            The Road Report newsletter
          </span>
          <span className="block text-xs text-brand-muted mt-0.5">
            New records, research tips, and stories from the archive.
          </span>
        </label>
        {(status === null || saving) && (
          <Loader2 className="w-4 h-4 animate-spin text-brand-muted ml-auto shrink-0" />
        )}
      </div>

      {status === 'cleaned' && (
        <p className="text-xs text-brand-muted border-t border-brand-gold/[0.08] pt-3">
          We stopped sending to this address because messages were being rejected or
          marked as spam. Tick the box above to start again.
        </p>
      )}

      <p className="text-[11px] text-brand-muted/70 border-t border-brand-gold/[0.08] pt-3">
        Account emails &mdash; receipts, password resets, and booking confirmations
        &mdash; are part of the service and are always sent.
      </p>
    </div>
  );
}
