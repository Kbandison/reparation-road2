import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'My Profile — Community' };

// Entry point for managing your own forum identity. If you already have a
// handle, jump to your public profile; otherwise prompt you to set one up.
/**
 * "My profile" is a redirect, not a page.
 *
 * With a handle, it goes to your public profile. Without one, it goes to the
 * dashboard, where the editor now lives — there is no reason to keep a second
 * setup screen that edits the same six fields.
 */
export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .single();

  redirect(profile?.handle ? `/forum/u/${profile.handle}` : '/dashboard');
}
