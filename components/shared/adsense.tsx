'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

// Don't load ads on private / functional areas.
const EXCLUDED_PREFIXES = [
  '/admin',
  '/dashboard',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];

// Loads the Google AdSense script on public pages only. Site ownership is
// verified separately via the `google-adsense-account` meta tag + ads.txt, so
// this only controls where ads may actually appear.
export function AdSense() {
  const pathname = usePathname();
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <Script
      id="google-adsense"
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7115663348250319"
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
