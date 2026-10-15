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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from picking /Users/naknak (parent lockfile) as workspace root
  outputFileTracingRoot: projectRoot,
  productionBrowserSourceMaps: true,
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