/** @type {import('next').NextConfig} */
const API_PORT = process.env.API_PORT ?? '3001';

const nextConfig = {
  reactStrictMode: true,
  // In local dev, proxy /api/* to the NestJS server so the browser can hit a
  // single origin (mirrors what nginx does in production). In production nginx
  // owns this routing, so the rewrite is harmless there.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://127.0.0.1:${API_PORT}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
