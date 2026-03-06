import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MainNavServer } from '@/components/layout/main-nav-server';
import './globals.css';

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
  metadataBase: new URL('https://reparationroad.org'),
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
    url: 'https://reparationroad.org',
    siteName: 'Reparation Road',
    title: 'Reparation Road — Restoring History Through Research and Advocacy',
    description:
      'Uncovering Black history and empowering communities through research and education.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reparation Road',
    description: 'Restoring history through research and advocacy.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfairDisplay.variable} ${dmSans.variable} antialiased`}
      >
        <TooltipProvider>
          <MainNavServer />
          {children}
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
