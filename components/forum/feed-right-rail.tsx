import Link from 'next/link';
import { Crown, Users } from 'lucide-react';
import { Avatar } from './avatar';

export interface FollowedUser {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
}

interface Props {
  following: FollowedUser[];
  isSignedIn: boolean;
}

// The right rail: a sponsored slot up top, then the people the viewer follows.
// Attached to the feed (Facebook-style), sticky as the feed scrolls.
export function FeedRightRail({ following, isSignedIn }: Props) {
  return (
    <aside className="hidden xl:block w-[300px] shrink-0">
      <div className="sticky top-20 space-y-4">
        <AdSlot />

        {/* Following */}
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-brand-gold" />
            <h2 className="text-sm font-semibold text-brand-cream">Following</h2>
          </div>

          {!isSignedIn ? (
            <p className="text-xs text-brand-muted leading-relaxed">
              <Link href="/login" className="text-brand-gold hover:underline">
                Sign in
              </Link>{' '}
              to follow researchers and see them here.
            </p>
          ) : following.length === 0 ? (
            <p className="text-xs text-brand-muted leading-relaxed">
              You&apos;re not following anyone yet. Open a researcher&apos;s profile and tap{' '}
              <span className="text-brand-cream">Follow</span> to see them here.
            </p>
          ) : (
            <ul className="space-y-1">
              {following.slice(0, 12).map((u) => (
                <li key={u.id}>
                  <Link
                    href={u.handle ? `/forum/u/${u.handle}` : '#'}
                    className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-xl hover:bg-brand-card-hover transition-colors"
                  >
                    <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm text-brand-cream truncate">{u.displayName}</p>
                      {u.handle && <p className="text-[11px] text-brand-muted truncate">@{u.handle}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="px-1 text-[11px] text-brand-muted/70">
          Reparation Road · A Black history digital archive
        </p>
      </div>
    </aside>
  );
}

// A tasteful house "ad" slot. The client can later swap this for a real ad
// network; for now it promotes Premium membership.
function AdSlot() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-gold/15 bg-gradient-to-br from-brand-gold/[0.12] to-brand-burgundy/[0.10] p-4">
      <span className="absolute top-2 right-3 text-[10px] uppercase tracking-wide text-brand-muted/70">
        Sponsored
      </span>
      <div className="flex items-center gap-2 mb-1.5">
        <Crown className="w-4 h-4 text-brand-gold" />
        <p className="text-sm font-semibold text-brand-cream">Go Premium</p>
      </div>
      <p className="text-xs text-brand-cream-muted leading-relaxed mb-3">
        Unlock every collection, advanced search, downloads, and priority booking.
      </p>
      <Link
        href="/membership"
        className="inline-block text-xs font-medium text-brand-bg bg-brand-gold hover:bg-brand-gold-light rounded-lg px-3 py-1.5 transition-colors"
      >
        Learn more
      </Link>
    </div>
  );
}
