'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { OAuthButtons } from '@/components/auth/oauth-buttons';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8">
      <h1 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Welcome Back
      </h1>
      <p className="text-brand-muted text-sm text-center mb-8">
        Sign in to continue your research
      </p>

      <OAuthButtons redirectTo={redirect} />

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-brand-gold/[0.08]" />
        <span className="text-xs text-brand-muted">or continue with email</span>
        <div className="flex-1 h-px bg-brand-gold/[0.08]" />
      </div>

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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-gold hover:text-brand-gold-light"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
        </Button>
      </form>

      <p className="text-brand-muted text-sm text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-brand-gold hover:text-brand-gold-light">
          Sign up
        </Link>
      </p>
    </div>
  );
}
