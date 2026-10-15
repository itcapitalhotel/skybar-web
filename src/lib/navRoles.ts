import type { UserRole } from '@/lib/api/types';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearAuthToken } from '@/lib/api/config';

export const PUBLIC_PATHS = new Set(['/login']);

export const NAV_TABS = [
  { label: 'Floor Map', href: '/', roles: ['Admin', 'Manager', 'Bartender', 'Cashier'] as UserRole[] },
  { label: 'Split & Merge Bill', href: '/shift-cash-split-bill', roles: ['Admin', 'Manager', 'Cashier'] as UserRole[] },
  { label: 'Reports', href: '/reports', roles: ['Admin', 'Manager'] as UserRole[] },
  { label: 'Table Bookings', href: '/table-bookings', roles: ['Admin', 'Manager', 'Bartender', 'Cashier'] as UserRole[] },
  { label: 'Post Items', href: '/post-items', roles: ['Admin', 'Manager'] as UserRole[] },
  { label: 'Dashboard', href: '/manager-dashboard', roles: ['Admin', 'Manager'] as UserRole[] },
  { label: 'Staff', href: '/staff-management', roles: ['Admin'] as UserRole[] },
  { label: 'Analytics', href: '/analytics', roles: ['Admin', 'Manager'] as UserRole[] },
  { label: 'Admin Config', href: '/admin-config', roles: ['Admin'] as UserRole[] },
  { label: 'API Spec', href: '/api-spec', roles: ['Admin'] as UserRole[] },
] as const;

const ROUTE_ACCESS: Record<string, UserRole[]> = Object.fromEntries(
  NAV_TABS.map((tab) => [tab.href, [...tab.roles]]),
);

ROUTE_ACCESS['/user-management'] = ['Admin'];
ROUTE_ACCESS['/zone-management'] = ['Admin', 'Manager'];
ROUTE_ACCESS['/menu-categories'] = ['Admin', 'Manager'];

const ROUTE_KEYS = Object.keys(ROUTE_ACCESS).sort((a, b) => b.length - a.length);

export function isUserRole(value: string | undefined): value is UserRole {
  return value === 'Admin' || value === 'Manager' || value === 'Bartender' || value === 'Cashier';
}

export function canAccessRoute(pathname: string, role: UserRole): boolean {
  for (const path of ROUTE_KEYS) {
    const matches =
      path === '/'
        ? pathname === '/'
        : pathname === path || pathname.startsWith(`${path}/`);

    if (matches) {
      return ROUTE_ACCESS[path].includes(role);
    }
  }

  // Unknown routes — allow any authenticated role (prevents redirect traps on new pages)
  return true;
}

/** Returns a path to redirect to, or null if the current path is fine. Client-only. */
export function getAuthRedirect(pathname: string): string | null {
  if (typeof window === 'undefined') return null;

  const isPublic = PUBLIC_PATHS.has(pathname);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (!token) {
    return isPublic ? null : '/login';
  }

  let role: string | undefined;
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    role = raw ? (JSON.parse(raw) as { role?: string }).role : undefined;
  } catch {
    role = undefined;
  }

  if (!isUserRole(role)) {
    clearAuthToken();
    return '/login';
  }

  if (isPublic) {
    return '/';
  }

  if (!canAccessRoute(pathname, role)) {
    return '/';
  }

  return null;
}
