import type { NextConfig } from 'next';
import { withBotId } from 'botid/next/config';

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

// withBotId adds the rewrites Vercel BotID's browser check runs through (see instrumentation-client.ts).
export default withBotId(nextConfig);
