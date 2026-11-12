import type { NextConfig } from 'next';

// Defense-in-depth headers. Keep the referrer origin available for map SDK
// domain validation and do not impose a CSP until every map/tile/voice origin
// has been tested in both Production and Preview.
const nextConfig: NextConfig = {
  ...(process.env.SUNNY_VERCEL_BUILD === '1' ? { typescript: { tsconfigPath: 'tsconfig.vercel.json' } } : {}),
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
        { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
      ],
    }];
  },
};

export default nextConfig;
