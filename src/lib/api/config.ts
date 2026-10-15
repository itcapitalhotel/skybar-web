// ─── API Configuration ────────────────────────────────────────────────────────
// Browser (Mac or phone): requests go to same-origin /api → Next.js proxies to Spring Boot.
// This avoids CORS preflight (4028 → 8080 cross-origin).
// WebSockets still connect directly to port 8080 via getWsBaseUrl().

const DEFAULT_API = 'http://127.0.0.1:8080/api';

/** Resolve API base URL at call time. */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Same-origin proxy: http://172.19.13.248:4028/api/... → Next → http://127.0.0.1:8080/api/...
    return `${window.location.origin}/api`;
  }
  // SSR / server-side: talk to backend directly on the Mac
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API;
}

/** WebSocket base (direct to Spring Boot — not proxied by Next.js). */
export function getWsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}:8080`;
  }
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API;
  return api.replace(/^http/, 'ws').replace(/\/api$/, '');
}

/** @deprecated use getApiBaseUrl() */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API;

// Token storage key used by the login flow
export const AUTH_TOKEN_KEY = 'skybar_auth_token';
export const AUTH_USER_KEY = 'skybar_auth_user';

export interface StoredAuthUser {
  id: string;
  name: string;
  role: string;
  terminalId?: string;
  avatar?: string;
}

/** Retrieve the stored JWT (client-side only) */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Persist a JWT after login */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/** Remove the JWT on logout */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function setAuthUser(user: StoredAuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getAuthUser(): StoredAuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

/** Persist token + user together so AuthGuard never sees a token without a role. */
export function persistLoginSession(
  token: string,
  user: StoredAuthUser,
): void {
  setAuthToken(token);
  setAuthUser(user);
}
