'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/contexts/user-context';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { profile } = useUser();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
    }
  }, [profile]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', profile!.id);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
      router.refresh();
    }
    setSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSavingPassword(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated');
      setNewPassword('');
    }
    setSavingPassword(false);
  }

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="Account Settings" />

      <div className="max-w-xl space-y-8">
        {/* Profile info */}
        <form onSubmit={handleUpdateProfile} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-brand-cream">Profile Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile?.email || ''} disabled className="bg-brand-bg border-brand-gold/[0.08]" />
          </div>
          <div className="space-y-2">
            <Label>Subscription</Label>
            <p className="text-sm text-brand-cream capitalize">{profile?.subscription_status || 'Free'}</p>
          </div>
          <Button type="submit" disabled={saving} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </form>

        {/* Change password */}
        <form onSubmit={handleChangePassword} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-brand-cream">Change Password</h2>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input
              type="password"
              placeholder="Minimum 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>
          <Button type="submit" disabled={savingPassword} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
          </Button>
        </form>
      </div>
    </>
  );
}
