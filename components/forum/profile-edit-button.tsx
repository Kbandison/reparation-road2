'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileEditModal } from './profile-edit-modal';
import type { Profile } from '@/lib/types';

export function ProfileEditButton({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-brand-gold/20 text-brand-cream rounded-xl"
      >
        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit profile
      </Button>
      {open && <ProfileEditModal profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}
