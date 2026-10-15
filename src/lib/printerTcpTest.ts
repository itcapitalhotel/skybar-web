import { configApi } from '@/lib/api/client';
import type { PrinterTestResponse } from '@/lib/api/types';
import { isValidIpv4, validatePrinterEndpoint } from '@/lib/printerValidate';

export const PRINTER_PING_COUNT = 5;
export const PRINTER_PING_GAP_MS = 350;

export type PingSlot = 'idle' | 'pending' | 'ok' | 'fail';

export function idlePingSlots(): PingSlot[] {
  return Array.from({ length: PRINTER_PING_COUNT }, () => 'idle');
}

/** True only when API reports a real TCP connect — never trust stub/invalid IP. */
export function isPrinterTcpReachable(printerIp: string, result: PrinterTestResponse): boolean {
  const ip = printerIp.trim();
  if (!isValidIpv4(ip)) return false;
  if (!result.connected) return false;

  const msg = (result.message ?? '').toLowerCase();
  if (
    msg.includes('stub')
    || msg.includes('mock')
    || msg.includes('placeholder')
    || msg.includes('not implemented')
    || msg.includes('always success')
  ) {
    return false;
  }

  if (result.printerIp && result.printerIp.trim() !== ip) return false;

  if (typeof result.latencyMs === 'number' && result.latencyMs >= 0) return true;
  if (msg.includes('timeout') || msg.includes('refused') || msg.includes('unreachable')) return false;
  if (msg.length >= 12 && (msg.includes('connect') || msg.includes('reachable') || msg.includes(':'))) {
    return true;
  }

  return false;
}

async function verifyLocalTcpInDev(printerIp: string, printerPort: string | number): Promise<{
  ok: boolean;
  message: string;
} | null> {
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const res = await fetch('/api/dev/printer-tcp-probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerIp, printerPort: Number(printerPort) || 9100 }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok) {
      return { ok: false, message: data.message?.trim() || 'Local TCP probe failed' };
    }
    return { ok: Boolean(data.ok), message: data.message?.trim() || (data.ok ? 'Local TCP OK' : 'Local TCP failed') };
  } catch {
    return null;
  }
}

/** Five TCP checks via POST /api/config/printer/test (same IP:port as the form). */
export async function runTcpPrinterPingSeries(
  printerIp: string,
  printerPort: string | number,
  onSlotUpdate: (index: number, slot: PingSlot) => void,
  onComplete?: (summary: { lastMessage: string; okCount: number }) => void,
): Promise<boolean> {
  const check = validatePrinterEndpoint(printerIp, printerPort);
  if (!check.ok) {
    for (let i = 0; i < PRINTER_PING_COUNT; i++) {
      onSlotUpdate(i, 'fail');
    }
    onComplete?.({ lastMessage: check.error, okCount: 0 });
    return false;
  }

  let lastMessage = '';
  let okCount = 0;
  for (let i = 0; i < PRINTER_PING_COUNT; i++) {
    onSlotUpdate(i, 'pending');
    let ok = false;
    try {
      const result = await configApi.testPrinter(printerIp, printerPort);
      lastMessage = result.message?.trim() || (result.connected ? 'API said connected' : 'No response');
      ok = isPrinterTcpReachable(printerIp, result);
      if (result.connected && !ok) {
        lastMessage = `Server returned success but check failed — ${lastMessage}. Fix backend TCP test or response.`;
      }
      if (ok) {
        const local = await verifyLocalTcpInDev(printerIp, printerPort);
        if (local && !local.ok) {
          ok = false;
          lastMessage = `Backend reported OK, but this computer cannot open TCP to ${printerIp}:${printerPort} (${local.message}). ICMP ping may also fail — fix backend to use a real socket test.`;
        }
      }
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : 'Request failed';
      ok = false;
    }
    if (ok) okCount += 1;
    onSlotUpdate(i, ok ? 'ok' : 'fail');
    if (i < PRINTER_PING_COUNT - 1) {
      await new Promise(resolve => setTimeout(resolve, PRINTER_PING_GAP_MS));
    }
  }
  onComplete?.({ lastMessage, okCount });
  return okCount > 0;
}

export function pingSummary(slots: PingSlot[]): string | null {
  if (slots.every(s => s === 'idle')) return null;
  if (slots.some(s => s === 'pending')) return 'Pinging…';
  const ok = slots.filter(s => s === 'ok').length;
  return `${ok}/${PRINTER_PING_COUNT} reachable`;
}
