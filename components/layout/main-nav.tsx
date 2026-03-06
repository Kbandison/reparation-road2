'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, LayoutDashboard, Settings, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Profile } from '@/lib/types';

const navLinks = [
  { label: 'Our Story', href: '/about' },
  { label: 'Collection', href: '/collection' },
  { label: 'Forum', href: '/forum' },
  { label: 'Membership', href: '/membership' },
  { label: 'Booking', href: '/booking' },
];

interface MainNavProps {
  profile?: Profile | null;
}

export function MainNav({ profile }: MainNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isLoggedIn = !!profile;
  const isAdmin = profile?.role === 'admin';
  const initial = profile?.first_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || '?';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-brand-bg/80 backdrop-blur-lg border-b border-brand-gold/10'
            : 'bg-brand-card/80 backdrop-blur-lg border-b border-brand-gold/[0.08]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-reparation-road.png"
              alt="Reparation Road"
              width={36}
              height={36}
              className="rounded-full"
            />
            <span className="font-display text-lg font-semibold text-brand-cream hidden sm:block">
              Reparation Road
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-body text-sm transition-colors ${
                    isActive
                      ? 'text-brand-gold font-medium'
                      : 'text-brand-muted hover:text-brand-gold'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-brand-card-hover transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-brand-gold/10 text-brand-gold text-xs font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-brand-card border-brand-gold/[0.08]">
                  <div className="px-2 py-1.5 border-b border-brand-gold/[0.08] mb-1">
                    <p className="text-sm font-medium text-brand-cream truncate">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-xs text-brand-muted truncate">{profile?.email}</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="text-brand-cream">
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings" className="text-brand-cream">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="text-brand-cream">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleSignOut} className="text-brand-burgundy-light">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl text-sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-brand-cream p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-brand-bg/95 backdrop-blur-lg md:hidden">
          <div className="flex flex-col items-center justify-center h-full gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="font-display text-2xl text-brand-cream hover:text-brand-gold transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="font-display text-2xl text-brand-cream hover:text-brand-gold transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-brand-burgundy-light font-body text-sm mt-4"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)}>
                <Button className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl px-8 mt-4">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
