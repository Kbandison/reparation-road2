'use client';

import { useState } from 'react';
import { Loader2, Mail, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SocialLinks } from '@/components/shared/social-links';

export function ContactSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="contact" className="py-24 px-6 scroll-mt-20 border-t border-brand-gold/10">
      <div className="max-w-2xl mx-auto text-center">
        <p className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-3">
          Get in touch
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-cream mb-4">
          Contact Us
        </h2>
        <p className="font-body text-base text-brand-muted leading-relaxed mb-8">
          Questions about the archive, a research request, or want to contribute records? Send us a
          message and we&apos;ll get back to you.
        </p>

        {sent ? (
          <div className="bg-brand-card border border-brand-sage/30 rounded-2xl p-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-sage/15 flex items-center justify-center">
              <Check className="w-6 h-6 text-brand-sage" />
            </div>
            <p className="font-display text-lg text-brand-cream mb-1">Thank you!</p>
            <p className="text-sm text-brand-muted">
              Your message is on its way. We&apos;ll reply to <span className="text-brand-cream">{email}</span> soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 md:p-8 text-left space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                placeholder="How can we help?"
                className="bg-brand-bg border-brand-gold/[0.15] focus:border-brand-gold resize-y"
              />
            </div>

            {error && <p className="text-sm text-brand-burgundy-light">{error}</p>}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
              <SocialLinks />
              <Button
                type="submit"
                disabled={loading}
                className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-6 h-11 w-full sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1.5" /> Send message
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        <p className="mt-6 text-sm text-brand-muted inline-flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-brand-gold" /> Or email us directly at{' '}
          <a href="mailto:info@reparationroad.org" className="text-brand-gold hover:underline">
            info@reparationroad.org
          </a>
        </p>
      </div>
    </section>
  );
}
