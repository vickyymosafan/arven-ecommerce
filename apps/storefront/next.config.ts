import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {},
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  transpilePackages: ['@arven/ui', '@arven/three-engine', 'three'],
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/decoders/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
