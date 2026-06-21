'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/lib/types';

interface Props {
  profile: Profile;
  onClose: () => void;
}

const FIELD =
  'w-full rounded-xl border border-brand-gold/[0.15] bg-brand-bg/60 px-3 py-2 text-sm text-brand-cream placeholder:text-brand-muted/60 focus:border-brand-gold/40 focus:outline-none';
const LABEL = 'block text-xs font-medium text-brand-muted mb-1';

export function ProfileEditModal({ profile, onClose }: Props) {
  const router = useRouter();
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [surnames, setSurnames] = useState((profile.research_surnames ?? []).join(', '));
  const [regions, setRegions] = useState((profile.research_regions ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
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
        setError(data.error || 'Could not save');
        return;
      }
      onClose();
      // If the handle changed, route to the new profile URL; else just refresh.
      if (data.profile?.handle && data.profile.handle !== profile.handle) {
        router.push(`/forum/u/${data.profile.handle}`);
      } else {
        router.refresh();
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-brand-bg border border-brand-gold/[0.12] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-gold/[0.08]">
          <h2 className="font-display text-lg font-semibold text-brand-cream">Edit profile</h2>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-cream" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div>
            <label className={LABEL}>Handle</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-brand-muted">@</span>
              <input
                className={FIELD}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="yourname"
              />
            </div>
            <p className="text-[11px] text-brand-muted mt-1">3–20 chars: lowercase letters, numbers, underscores.</p>
          </div>

          <div>
            <label className={LABEL}>Display name</label>
            <input className={FIELD} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How your name appears" />
          </div>

          <div>
            <label className={LABEL}>Bio</label>
            <textarea className={`${FIELD} min-h-[72px] resize-y`} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line or two about your research" />
          </div>

          <div>
            <label className={LABEL}>Avatar image URL (optional)</label>
            <input className={FIELD} value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </div>

          <div>
            <label className={LABEL}>Surnames you research</label>
            <input className={FIELD} value={surnames} onChange={(e) => setSurnames(e.target.value)} placeholder="Crowell, Perryman" />
            <p className="text-[11px] text-brand-muted mt-1">Comma-separated. Helps others find you.</p>
          </div>

          <div>
            <label className={LABEL}>Regions you research</label>
            <input className={FIELD} value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="Georgia, Creek Nation" />
          </div>

          {error && <p className="text-xs text-brand-burgundy-light">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-brand-gold/[0.08]">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-brand-gold/20 text-brand-cream rounded-xl">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
