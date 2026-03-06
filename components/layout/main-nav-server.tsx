import { createClient } from '@/lib/supabase/server';
import { MainNav } from '@/components/layout/main-nav';
import type { Profile } from '@/lib/types';

export async function MainNavServer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data as Profile | null;
  }

  return <MainNav profile={profile} />;
}
