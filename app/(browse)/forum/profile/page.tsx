import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from '@/components/forum/avatar';
import { ProfileEditButton } from '@/components/forum/profile-edit-button';
import type { Profile } from '@/lib/types';

export const metadata: Metadata = { title: 'My Profile — Community' };

// Entry point for managing your own forum identity. If you already have a
// handle, jump to your public profile; otherwise prompt you to set one up.
export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const profile = profileRaw as Profile;

  if (profile?.handle) {
    redirect(`/forum/u/${profile.handle}`);
  }

  const name =
    profile?.display_name?.trim() ||
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() ||
    'Researcher';

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 text-center">
        <div className="flex justify-center mb-4">
          <Avatar name={name} size={64} />
        </div>
        <h1 className="font-display text-xl font-semibold text-brand-cream mb-1">Set up your community profile</h1>
        <p className="text-sm text-brand-muted mb-5">
          Pick a handle, add the surnames and regions you research, and let other researchers find
          you. You can change it anytime.
        </p>
        <ProfileEditButton profile={profile} />
      </div>
    </div>
  );
}
