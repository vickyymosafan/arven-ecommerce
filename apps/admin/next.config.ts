import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {},
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: ['@arven/ui'],
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
