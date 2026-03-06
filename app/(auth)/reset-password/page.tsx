'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success('Password updated successfully');
    router.push('/login');
  }

  if (!ready) {
    return (
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-gold mx-auto mb-4" />
        <p className="text-brand-muted text-sm">Verifying reset link...</p>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-8">
      <h1 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Set New Password
      </h1>
      <p className="text-brand-muted text-sm text-center mb-8">
        Choose a new password for your account
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
        </Button>
      </form>
    </div>
  );
}
