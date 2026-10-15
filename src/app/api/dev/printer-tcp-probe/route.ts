import net from 'node:net';

import { NextResponse } from 'next/server';

import { validatePrinterEndpoint } from '@/lib/printerValidate';

export const runtime = 'nodejs';

const TIMEOUT_MS = 3000;

function tcpReachable(
  host: string,
  port: number,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({
        ok,
        message,
        latencyMs: ok ? Date.now() - start : undefined,
      });
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => finish(true, `TCP connect OK (${host}:${port})`));
    socket.once('timeout', () => finish(false, `Connection timed out (${host}:${port})`));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      finish(false, err.message || 'Connection failed');
    });
    socket.connect(port, host);
  });
}

/** Dev-only: open TCP from the Next.js host (same machine as `nc` / Terminal). */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, message: 'Local probe disabled in production' }, { status: 404 });
  }

  let body: { printerIp?: string; printerPort?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const port = Number(body.printerPort) || 9100;
  const check = validatePrinterEndpoint(String(body.printerIp ?? ''), port);
  if (!check.ok) {
    return NextResponse.json({ ok: false, message: check.error }, { status: 400 });
  }

  const ip = String(body.printerIp ?? '').trim();
  const result = await tcpReachable(ip, port);
  return NextResponse.json(result);
}
