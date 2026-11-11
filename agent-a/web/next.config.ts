import { join } from 'node:path';
import type { NextConfig } from 'next';

const root = join(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  // The shared Zod schemas and FeeCalculator are TypeScript source in the monorepo.
  transpilePackages: ['@finance/shared'],
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
