import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { AdSense } from '@/components/shared/adsense';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/contexts/theme-context';
import { MainNavServer } from '@/components/layout/main-nav-server';
import './globals.css';
import { Analytics } from "@vercel/analytics/next"

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair-display',
  subsets: ['latin'],
  display: 'swap',
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.reparationroad.org'),
  title: {
    default: 'Reparation Road — Restoring History Through Research and Advocacy',
    template: '%s | Reparation Road',
  },
  description:
    'A cultural and historical resource dedicated to uncovering Black history and empowering communities through research, education, and digital preservation.',
  keywords: [
    'Black history',
    'genealogy',
    'family research',
    'historical records',
    'slavery records',
    'African American history',
    'digital archive',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.reparationroad.org',
    siteName: 'Reparation Road',
    title: 'Reparation Road — Restoring History Through Research and Advocacy',
    description:
      'Uncovering Black history and empowering communities through research and education.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Reparation Road — Restoring history through research and advocacy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reparation Road',
    description: 'Restoring history through research and advocacy.',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true },
  other: {
    // Google AdSense site-ownership verification (meta-tag method).
    'google-adsense-account': 'ca-pub-7115663348250319',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F0D0B',
};

// Organization + WebSite structured data for richer search results.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://reparationroad.org/#organization',
      name: 'Reparation Road',
      url: 'https://www.reparationroad.org',
      logo: 'https://www.reparationroad.org/icon-512.png',
      description:
        'A cultural and historical resource dedicated to uncovering Black history and empowering communities through research, education, and digital preservation.',
      slogan: 'I am because we are.',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://reparationroad.org/#website',
      url: 'https://www.reparationroad.org',
      name: 'Reparation Road',
      publisher: { '@id': 'https://reparationroad.org/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://reparationroad.org/search?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('rr-theme');if(t==='dark'){document.documentElement.classList.remove('light')}}catch(e){}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${playfairDisplay.variable} ${dmSans.variable} antialiased`}
      >
      <AdSense />
      <Analytics/>
        <ThemeProvider>
          <TooltipProvider>
            <MainNavServer />
            {children}
          </TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
