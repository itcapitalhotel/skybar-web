import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { imageHosts } from './image-hosts.config.mjs';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080';

function hostOnly(value) {
  return String(value).trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

function getLanDevOrigins() {
  // Next compares the Origin hostname only (no port), so 172.20.15.99:4028
  // must be listed as 172.20.15.99 or /_next assets are blocked.
  const origins = ['127.0.0.1', '172.20.15.99'];
  const envOrigin = process.env.DEV_LAN_ORIGIN;
  if (envOrigin) origins.push(hostOnly(envOrigin));

  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        origins.push(net.address);
      }
    }
  }
  return [...new Set(origins.filter(Boolean))];
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

  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@heroicons/react'],
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