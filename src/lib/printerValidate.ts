/** Validate printer network fields before test or save. */

export function isValidIpv4(ip: string): boolean {
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    return true;
  });
}

export function isValidPrinterPort(port: string | number): boolean {
  const n = typeof port === 'number' ? port : Number(String(port).trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function validatePrinterEndpoint(
  printerIp: string,
  printerPort: string | number,
): { ok: true } | { ok: false; error: string } {
  const ip = printerIp.trim();
  if (!ip) return { ok: false, error: 'Enter a printer IP address' };
  if (!isValidIpv4(ip)) {
    return { ok: false, error: 'Invalid IP — use four numbers like 192.168.1.100' };
  }
  if (!isValidPrinterPort(printerPort)) {
    return { ok: false, error: 'Port must be between 1 and 65535' };
  }
  return { ok: true };
}
