'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { X, Loader2, CheckCircle } from 'lucide-react';

type AuthView = 'login' | 'signup' | 'forgot';

interface AuthModalProps {
  onClose: () => void;
  defaultView?: AuthView;
}

export function AuthModal({ onClose, defaultView = 'login' }: AuthModalProps) {
  const [view, setView] = useState<AuthView>(defaultView);
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSuccess = () => {
    onClose();
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-[440px]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-brand-card transition-colors text-brand-muted hover:text-brand-cream z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          {view === 'login' && (
            <LoginForm
              onSuccess={handleSuccess}
              onSwitchToSignup={() => setView('signup')}
              onSwitchToForgot={() => setView('forgot')}
            />
          )}
          {view === 'signup' && (
            <SignupForm
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setView('login')}
            />
          )}
          {view === 'forgot' && (
            <ForgotPasswordForm onSwitchToLogin={() => setView('login')} />
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  onSuccess,
  onSwitchToSignup,
  onSwitchToForgot,
}: {
  onSuccess: () => void;
  onSwitchToSignup: () => void;
  onSwitchToForgot: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    onSuccess();
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Welcome Back
      </h2>
      <p className="text-brand-muted text-sm text-center mb-8">
        Sign in to continue your research
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="modal-email">Email</Label>
          <Input
            id="modal-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="modal-password">Password</Label>
            <button
              type="button"
              onClick={onSwitchToForgot}
              className="text-xs text-brand-gold hover:text-brand-gold-light"
            >
              Forgot password?
            </button>
          </div>
          <Input
            id="modal-password"
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
        <button
          onClick={onSwitchToSignup}
          className="text-brand-gold hover:text-brand-gold-light"
        >
          Sign up
        </button>
      </p>
    </>
  );
}

function SignupForm({
  onSuccess,
  onSwitchToLogin,
}: {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [donorCode, setDonorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

    // Send welcome email BEFORE signUp — signUp triggers immediate auth redirect
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', email, firstName, lastName }),
      });
    } catch {
      // Don't block signup if email fails
    }

    const supabase = createClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Update profile names + donor status via server (bypasses RLS)
    if (signUpData.user) {
      navigator.sendBeacon(
        '/api/contact',
        new Blob([JSON.stringify({
          type: 'welcome-profile',
          userId: signUpData.user.id,
          firstName,
          lastName,
          donorCode: donorCode.trim() || undefined,
        })], { type: 'application/json' })
      );
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="text-center">
        <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" />
        <h2 className="font-display text-2xl font-semibold text-brand-cream mb-2">
          Check Your Email
        </h2>
        <p className="text-brand-muted text-sm mb-6">
          We&apos;ve sent a confirmation link to{' '}
          <strong className="text-brand-cream">{email}</strong>. Click the link
          to activate your account.
        </p>
        <Button
          variant="outline"
          onClick={onSwitchToLogin}
          className="border-brand-gold/30 text-brand-cream rounded-xl"
        >
          Back to Sign In
        </Button>
      </div>
    );
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Create Your Account
      </h2>
      <p className="text-brand-muted text-sm text-center mb-8">
        Join the community and start exploring
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="modal-firstName">First Name</Label>
            <Input
              id="modal-firstName"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoFocus
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modal-lastName">Last Name</Label>
            <Input
              id="modal-lastName"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="modal-signup-email">Email</Label>
          <Input
            id="modal-signup-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="modal-signup-password">Password</Label>
          <Input
            id="modal-signup-password"
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
          <Label htmlFor="modal-confirm-password">Confirm Password</Label>
          <Input
            id="modal-confirm-password"
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="modal-donor-code" className="text-brand-muted">
            Donor Code <span className="text-brand-muted/50">(optional)</span>
          </Label>
          <Input
            id="modal-donor-code"
            placeholder="Enter donor code if you have one"
            value={donorCode}
            onChange={(e) => setDonorCode(e.target.value)}
            className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
        </Button>
      </form>

      <p className="text-brand-muted text-sm text-center mt-6">
        Already have an account?{' '}
        <button
          onClick={onSwitchToLogin}
          className="text-brand-gold hover:text-brand-gold-light"
        >
          Sign in
        </button>
      </p>
    </>
  );
}

function ForgotPasswordForm({
  onSwitchToLogin,
}: {
  onSwitchToLogin: () => void;
}) {
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
      <div className="text-center">
        <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" />
        <h2 className="font-display text-xl font-semibold text-brand-cream mb-2">
          Check Your Email
        </h2>
        <p className="text-brand-muted text-sm mb-6">
          If an account exists for <strong className="text-brand-cream">{email}</strong>,
          you&apos;ll receive a password reset link.
        </p>
        <Button
          variant="outline"
          onClick={onSwitchToLogin}
          className="border-brand-gold/30 text-brand-cream rounded-xl"
        >
          Back to Sign In
        </Button>
      </div>
    );
  }

  return (
    <>
      <h2 className="font-display text-2xl font-semibold text-brand-cream text-center mb-2">
        Reset Password
      </h2>
      <p className="text-brand-muted text-sm text-center mb-8">
        Enter your email and we&apos;ll send you a reset link
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="modal-reset-email">Email</Label>
          <Input
            id="modal-reset-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
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
        <button
          onClick={onSwitchToLogin}
          className="text-brand-gold hover:text-brand-gold-light"
        >
          Back to Sign In
        </button>
      </p>
    </>
  );
}
