/**
 * Lightweight client-side security helpers for POS auth.
 * Real authorization still happens on the API (JWT + Spring Security).
 */

/** Decode JWT payload without verifying signature (browser cannot hold the secret). */
export function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True when JWT `exp` is missing or still in the future (with 30s skew). */
export function isJwtUnexpired(token: string, skewSeconds = 30): boolean {
  const payload = readJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp;
  if (typeof exp !== 'number') return true;
  return exp * 1000 > Date.now() - skewSeconds * 1000;
}
