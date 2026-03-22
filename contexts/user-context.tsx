'use client';

import { createContext, useContext } from 'react';
import type { Profile } from '@/lib/types';

interface UserContextType {
  profile: Profile | null;
  isAdmin: boolean;
  isPremium: boolean;
}

const UserContext = createContext<UserContextType>({
  profile: null,
  isAdmin: false,
  isPremium: false,
});

export function UserProvider({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const isAdmin = profile?.role === 'admin';
  const isPremium = profile?.subscription_status === 'paid' || profile?.subscription_status === 'donor';

  return (
    <UserContext.Provider value={{ profile, isAdmin, isPremium }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
