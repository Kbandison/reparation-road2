'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ImagePlus, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { Avatar } from '@/components/forum/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Profile } from '@/lib/types';

/**
 * The researcher's own profile, at the top of the dashboard.
 *
 * Everything here already existed but lived in Settings under "Community
 * Profile", which meant most people never filled it in — and an empty profile
 * is what makes tree connections useless when they arrive. Editing happens in
 * place so the dashboard doesn't bounce people elsewhere to add a photo.
 */
export function DashboardProfileCard({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [handle, setHandle] = useState(profile.handle || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [surnames, setSurnames] = useState((profile.research_surnames ?? []).join(', '));
  const [regions, setRegions] = useState((profile.research_regions ?? []).join(', '));

  const name =
    displayName.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    'Researcher';

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', files[0]);
      const res = await fetch('/api/forum/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.error || 'Upload failed');
        return;
      }
      setAvatarUrl(data.url);
      // Saved immediately rather than waiting for the form: a photo that
      // vanishes because you forgot to press save is a bad first experience.
      await save({ avatar_url: data.url }, 'Photo updated');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save(patch: Record<string, unknown>, message = 'Profile updated') {
    setSaving(true);
    try {
      const res = await fetch('/api/forum/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Could not save');
        return false;
      }
      toast.success(message);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const ok = await save({
      handle: handle.trim().toLowerCase(),
      display_name: displayName,
      bio,
      avatar_url: avatarUrl,
      research_surnames: surnames.split(',').map((s) => s.trim()).filter(Boolean),
      research_regions: regions.split(',').map((s) => s.trim()).filter(Boolean),
    });
    if (ok) setEditing(false);
  }

  const surnameList = surnames.split(',').map((s) => s.trim()).filter(Boolean);
  const regionList = regions.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 mb-8">
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Photo */}
        <div className="shrink-0 text-center sm:text-left">
          <Avatar name={name} src={avatarUrl || null} size={88} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-3 flex items-center gap-1.5 text-xs text-brand-gold hover:text-brand-gold-light mx-auto sm:mx-0 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" />
            )}
            {avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How your name appears"
                    className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                  />
                </div>
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
              </div>
              <div className="space-y-2">
                <Label>About your research</Label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="What you're looking for, and how far you've got."
                  className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold resize-y"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Surnames you research</Label>
                  <Input
                    value={surnames}
                    onChange={(e) => setSurnames(e.target.value)}
                    placeholder="Crowell, Perryman"
                    className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Regions</Label>
                  <Input
                    value={regions}
                    onChange={(e) => setRegions(e.target.value)}
                    placeholder="Georgia, Creek Nation"
                    className="bg-brand-card border-brand-gold/[0.15] focus:border-brand-gold"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveAll}
                  disabled={saving}
                  className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1.5" /> Save</>}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  className="border-brand-gold/25 text-brand-cream rounded-xl"
                >
                  <X className="w-4 h-4 mr-1.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-semibold text-brand-cream truncate">
                    {name}
                  </h2>
                  {profile.handle && (
                    <Link
                      href={`/forum/u/${profile.handle}`}
                      className="text-sm text-brand-gold hover:underline inline-flex items-center gap-1"
                    >
                      @{profile.handle} <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-xs text-brand-muted hover:text-brand-cream shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              </div>

              <p className="text-sm text-brand-muted leading-relaxed mt-3">
                {bio.trim() || 'Add a line about what you’re researching — it’s what other researchers see when your trees overlap.'}
              </p>

              {(surnameList.length > 0 || regionList.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {surnameList.map((s) => (
                    <span
                      key={`s-${s}`}
                      className="text-xs px-2.5 py-1 rounded-full bg-brand-gold/[0.10] text-brand-gold"
                    >
                      {s}
                    </span>
                  ))}
                  {regionList.map((r) => (
                    <span
                      key={`r-${r}`}
                      className="text-xs px-2.5 py-1 rounded-full bg-brand-sage/[0.12] text-brand-sage"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
