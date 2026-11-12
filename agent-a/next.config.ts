import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This folder is the whole project: never infer a workspace root above it.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // The API, infrastructure, and tests live beside the app; only app/ and shared/ are built.
  typescript: { tsconfigPath: 'tsconfig.json' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
