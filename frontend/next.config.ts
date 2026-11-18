import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Proxy the API through Next so the browser only ever talks to one origin.
  // That keeps the auth cookie same-origin: no CORS, no SameSite surprises,
  // and prod behind a single host behaves the same as dev.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
