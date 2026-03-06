'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 text-center">
        <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" />
        <h1 className="font-display text-2xl font-semibold text-brand-cream mb-2">
          Check Your Email
        </h1>
        <p className="text-brand-muted text-sm mb-6">
          We&apos;ve sent a password reset link to <strong className="text-brand-cream">{email}</strong>.
        </p>
        <Link href="/login">
          <Button variant="outline" className="border-brand-gold/30 text-brand-cream rounded-xl">
            Back to Sign In
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8">
      <h1 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Reset Password
      </h1>
      <p className="text-brand-muted text-sm text-center mb-8">
        Enter your email and we&apos;ll send you a reset link
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
        </Button>
      </form>

      <p className="text-brand-muted text-sm text-center mt-6">
        Remember your password?{' '}
        <Link href="/login" className="text-brand-gold hover:text-brand-gold-light">
          Sign in
        </Link>
      </p>
    </div>
  );
}
