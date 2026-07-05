import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reparation Road',
    short_name: 'Reparation Road',
    description:
      'A cultural and historical resource uncovering Black history through research, education, and digital preservation.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F0D0B',
    theme_color: '#0F0D0B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
