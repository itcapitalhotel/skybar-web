import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4028;
const root = join(fileURLToPath(import.meta.url), '..', '..');
const nextBin = join(root, 'node_modules', '.bin', 'next');

function getLocalIp() {
  const interfaces = networkInterfaces();
  const preferred = ['en0', 'en1', 'eth0', 'wlan0'];

  for (const name of preferred) {
    const address = interfaces[name]?.find(
      (net) => net.family === 'IPv4' && !net.internal,
    )?.address;
    if (address) return address;
  }

  for (const nets of Object.values(interfaces)) {
    const address = nets?.find(
      (net) => net.family === 'IPv4' && !net.internal,
    )?.address;
    if (address) return address;
  }

  return null;
}

// Bind 0.0.0.0 so BOTH localhost and LAN IP work
const host = '0.0.0.0';
const lanIp = getLocalIp();

console.log('');
console.log('  SkyBar POS dev server');
console.log('  ─────────────────────────────────');
console.log(`  Local:   http://localhost:${PORT}`);
if (lanIp) console.log(`  Network: http://${lanIp}:${PORT}`);
console.log('  ─────────────────────────────────');
console.log('');

const child = spawn(
  nextBin,
  ['dev', '-p', String(PORT), '-H', host],
  { stdio: 'inherit', cwd: root },
);

child.on('exit', (code) => process.exit(code ?? 0));
