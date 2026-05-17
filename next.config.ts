import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nviahrhrupqvwyglaxlj.supabase.co',
        // Covers both the object endpoint (/object/public) and the image
        // transform endpoint (/render/image/public) used to width-cap scans.
        pathname: '/storage/v1/**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
