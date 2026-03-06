import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UserProvider } from '@/contexts/user-context';
import { PlatformSidebar } from '@/components/layout/platform-sidebar';
import type { Profile } from '@/lib/types';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <UserProvider profile={profile as Profile | null}>
      <div className="pt-16 min-h-screen flex">
        <PlatformSidebar />
        <main className="flex-1 lg:ml-[260px]">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </UserProvider>
  );
}
