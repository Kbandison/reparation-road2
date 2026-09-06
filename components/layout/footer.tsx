import Image from 'next/image';
import Link from 'next/link';
import { SocialLinks } from '@/components/shared/social-links';
import { NewsletterSignup } from '@/components/newsletter/newsletter-signup';

const exploreLinks = [
  { label: 'Collection', href: '/collection' },
  { label: 'Search Records', href: '/search' },
  { label: 'About Us', href: '/about' },
];

const communityLinks = [
  { label: 'Forum', href: '/forum' },
  { label: 'Membership', href: '/membership' },
  { label: 'Dashboard', href: '/dashboard' },
];

const servicesLinks = [
  { label: 'Book a Session', href: '/booking' },
  { label: 'Pricing', href: '/membership' },
  { label: 'Contact', href: '/#contact' },
];

export function Footer() {
  return (
    <footer className="border-t border-brand-gold/10 bg-brand-bg">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Newsletter — the one path onto the list that doesn't require an account */}
        <NewsletterSignup
          variant="banner"
          className="border-b border-brand-gold/10 pb-12 mb-12"
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <Image
                src="/logo-reparation-road.png"
                alt="Reparation Road"
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="font-display text-lg font-semibold text-brand-cream">
                Reparation Road
              </span>
            </Link>
            <p className="text-brand-muted text-sm leading-relaxed">
              Restoring history through research and advocacy. A digital archive dedicated to uncovering Black history.
            </p>
            <SocialLinks className="mt-5" />
          </div>

          {/* Explore */}
          <div>
            <h4 className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-4">
              Explore
            </h4>
            <ul className="space-y-3">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-brand-muted hover:text-brand-cream transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-4">
              Community
            </h4>
            <ul className="space-y-3">
              {communityLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-brand-muted hover:text-brand-cream transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-body text-xs font-semibold tracking-widest uppercase text-brand-gold mb-4">
              Services
            </h4>
            <ul className="space-y-3">
              {servicesLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-brand-muted hover:text-brand-cream transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-brand-gold/10 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-brand-muted text-sm">
            &copy; 2026 Reparation Road. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/privacy" className="text-brand-muted hover:text-brand-cream transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-brand-muted hover:text-brand-cream transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>

        {/* Credit */}
        <div className="mt-6 text-center">
          <p className="text-xs text-brand-muted/60">
            Designed &amp; built by{' '}
            <a
              href="https://luxwebstudio.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-gold/80 hover:text-brand-gold transition-colors"
            >
              Luxweb Studio
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
