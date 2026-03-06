import { createClient } from '@/lib/supabase/server';
import { UserProvider } from '@/contexts/user-context';
import { Footer } from '@/components/layout/footer';
import type { Profile } from '@/lib/types';

export default async function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <UserProvider profile={profile}>
      <main className="pt-16 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
      <Footer />
    </UserProvider>
  );
}
