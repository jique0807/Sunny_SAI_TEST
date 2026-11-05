import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  ...(process.env.SUNNY_VERCEL_BUILD === '1' ? { typescript: { tsconfigPath: 'tsconfig.vercel.json' } } : {}),
};
export default nextConfig;
