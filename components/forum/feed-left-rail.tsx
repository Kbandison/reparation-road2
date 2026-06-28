'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield } from 'lucide-react';
import { platformNavItems } from '@/lib/constants';
import { useUser } from '@/contexts/user-context';
import { canUseFamilyTree } from '@/lib/family-tree/access';

// The same navigation the dashboard sidebar offers, rendered as a left rail
// "attached" to the feed (Facebook-style) rather than pinned to the screen edge.
export function FeedLeftRail() {
  const pathname = usePathname();
  const { isAdmin, profile } = useUser();

  // The family tree is gated while in private testing.
  const items = platformNavItems.filter(
    (item) => item.href !== '/family-tree' || canUseFamilyTree(profile),
  );

  return (
    <aside className="hidden lg:block w-[230px] shrink-0">
      <nav className="sticky top-20 space-y-1">
        {items.map((item) => {
          const isActive =
            item.href === '/forum'
              ? pathname.startsWith('/forum')
              : pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-gold/10 text-brand-gold'
                  : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-brand-burgundy/10 text-brand-burgundy-light'
                : 'text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover'
            }`}
          >
            <Shield className="w-5 h-5" />
            Admin Panel
          </Link>
        )}
      </nav>
    </aside>
  );
}
