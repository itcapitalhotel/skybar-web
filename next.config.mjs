import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { imageHosts } from './image-hosts.config.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080';

function getLanDevOrigins() {
  const origins = ['localhost:4028', '127.0.0.1:4028'];
  const envOrigin = process.env.DEV_LAN_ORIGIN;
  if (envOrigin) origins.push(envOrigin);

  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        origins.push(`${net.address}:4028`);
      }
    }
  }
  return [...new Set(origins)];
}

const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-XSS-Protection', value: '0' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Same-origin /api proxy + direct WS to backend in LAN/dev
      "connect-src 'self' ws: wss: http: https:",
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

if (isProd) {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from picking /Users/naknak (parent lockfile) as workspace root
  outputFileTracingRoot: projectRoot,
  // Never ship source maps to browsers in production (leaks app internals)
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  distDir: process.env.DIST_DIR || '.next',
  allowedDevOrigins: getLanDevOrigins(),

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
    qualities: [75, 85, 100],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  // Proxy /api/* → Spring Boot on Mac (avoids CORS from phone at http://<ip>:4028)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;