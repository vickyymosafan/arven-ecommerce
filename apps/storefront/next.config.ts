import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {},
  transpilePackages: ['@arven/ui'],
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
