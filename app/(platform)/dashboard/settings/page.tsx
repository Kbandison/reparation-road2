'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/contexts/user-context';
import { PageHeader } from '@/components/shared/page-header';
import { Avatar } from '@/components/forum/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, ImagePlus, ExternalLink } from 'lucide-react';
import { NewsletterPreferenceCard } from '@/components/newsletter/newsletter-preference-card';

export default function SettingsPage() {
  const { profile } = useUser();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Community profile (the same identity used across the forum).
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [surnames, setSurnames] = useState('');
  const [regions, setRegions] = useState('');
  const [savingCommunity, setSavingCommunity] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setHandle(profile.handle || '');
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
      setSurnames((profile.research_surnames ?? []).join(', '));
      setRegions((profile.research_regions ?? []).join(', '));
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

  async function handleAvatarUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', files[0]);
      const res = await fetch('/api/forum/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok && data.url) {
        setAvatarUrl(data.url);
        toast.success('Photo uploaded — save to apply');
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } finally {
      setUploadingAvatar(false);
      if (avatarRef.current) avatarRef.current.value = '';
    }
  }

  async function handleSaveCommunity(e: React.FormEvent) {
    e.preventDefault();
    setSavingCommunity(true);
    try {
      const res = await fetch('/api/forum/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: handle.trim().toLowerCase(),
          display_name: displayName,
          bio,
          avatar_url: avatarUrl,
          research_surnames: surnames.split(',').map((s) => s.trim()).filter(Boolean),
          research_regions: regions.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update community profile');
      } else {
        toast.success('Community profile updated');
        router.refresh();
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSavingCommunity(false);
    }
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

  const previewName = displayName.trim() || `${firstName} ${lastName}`.trim() || 'Researcher';

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

        {/* Email preferences */}
        <NewsletterPreferenceCard />

        {/* Community profile */}
        <form onSubmit={handleSaveCommunity} className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-brand-cream">Community Profile</h2>
              <p className="text-xs text-brand-muted mt-0.5">
                This is your identity across the community forum.
              </p>
            </div>
            {profile?.handle && (
              <Link
                href={`/forum/u/${profile.handle}`}
                className="text-xs text-brand-gold hover:underline inline-flex items-center gap-1 shrink-0"
              >
                View <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar name={previewName} src={avatarUrl || null} size={64} />
            <div>
              <input
                ref={avatarRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => avatarRef.current?.click()}
                disabled={uploadingAvatar}
                className="border-brand-gold/20 text-brand-cream rounded-xl"
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4 mr-1.5" /> Upload photo
                  </>
                )}
              </Button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="ml-3 text-xs text-brand-muted hover:text-brand-burgundy-light"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Handle</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-brand-muted">@</span>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourname"
                  className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How your name appears"
                className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A line or two about your research"
              rows={3}
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label>Surnames you research</Label>
            <Input
              value={surnames}
              onChange={(e) => setSurnames(e.target.value)}
              placeholder="Crowell, Perryman"
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
            <p className="text-[11px] text-brand-muted">Comma-separated. Helps others find you.</p>
          </div>

          <div className="space-y-2">
            <Label>Regions you research</Label>
            <Input
              value={regions}
              onChange={(e) => setRegions(e.target.value)}
              placeholder="Georgia, Creek Nation"
              className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
            />
          </div>

          <Button type="submit" disabled={savingCommunity} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            {savingCommunity ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Community Profile'}
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
