import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// One .env at the repository root serves every app (Next runs this file from apps/web).
loadEnvConfig(resolve(process.cwd(), '../..'));

const apiInternal = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const mapOrigin = (() => {
  try {
    return process.env.MAP_STYLE_URL ? new URL(process.env.MAP_STYLE_URL).origin : '';
  } catch {
    return '';
  }
})();

const csp = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; no third-party scripts are loaded.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${mapOrigin ? ` ${mapOrigin}` : ''}`,
  `connect-src 'self'${mapOrigin ? ` ${mapOrigin}` : ''}`,
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // The container image runs the self-contained server (`node apps/web/server.js`).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@harvestslot/contracts'],
  // Same-origin API in every environment: the browser only ever talks to this origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternal}/api/:path*` }];
  },
  // Older notification links.
  async redirects() {
    return [
      { source: '/settings/organisation', destination: '/organisation', permanent: false },
      { source: '/processor/receiving/:bookingId', destination: '/bookings/:bookingId/receiving', permanent: false },
      { source: '/admin/payments', destination: '/admin/outbox', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        ],
      },
      {
        // The service worker must never be cached by the browser HTTP cache.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
