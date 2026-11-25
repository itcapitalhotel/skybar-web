import type { UserRole } from '@/lib/api/types';
import { AUTH_USER_KEY, clearAuthToken, getAuthToken } from '@/lib/api/config';

export const PUBLIC_PATHS = new Set(['/login']);

export const NAV_TABS = [
  { label: 'Floor Map', href: '/', roles: ['Admin', 'Manager', 'Supervisor', 'Service', 'Bartender', 'Cashier'] as UserRole[] },
  { label: 'Split & Merge Bill', href: '/shift-cash-split-bill', roles: ['Admin', 'Manager', 'Supervisor', 'Service', 'Cashier'] as UserRole[] },
  { label: 'Reports', href: '/reports', roles: ['Admin', 'Manager', 'Supervisor', 'Finance'] as UserRole[] },
  { label: 'Void report', href: '/void-report', roles: ['Admin', 'Manager', 'Supervisor', 'Finance', 'Service'] as UserRole[] },
  { label: 'Table Bookings', href: '/table-bookings', roles: ['Admin', 'Manager', 'Supervisor', 'Service', 'Bartender', 'Cashier'] as UserRole[] },
  { label: 'Post Items', href: '/post-items', roles: ['Admin', 'Manager', 'Supervisor'] as UserRole[] },
  { label: 'Staff', href: '/staff-management', roles: ['Admin'] as UserRole[] },
  { label: 'Analytics', href: '/analytics', roles: ['Admin', 'Manager', 'Supervisor', 'Finance'] as UserRole[] },
  { label: 'Admin Config', href: '/admin-config', roles: ['Admin'] as UserRole[] },
] as const;

const ROUTE_ACCESS: Record<string, UserRole[]> = Object.fromEntries(
  NAV_TABS.map((tab) => [tab.href, [...tab.roles]]),
);

ROUTE_ACCESS['/user-management'] = ['Admin'];
ROUTE_ACCESS['/zone-management'] = ['Admin', 'Manager', 'Supervisor'];
ROUTE_ACCESS['/menu-categories'] = ['Admin', 'Manager', 'Supervisor'];
ROUTE_ACCESS['/manager-dashboard'] = ['Admin', 'Manager', 'Supervisor'];
ROUTE_ACCESS['/close-shift-report'] = ['Admin', 'Manager', 'Supervisor'];
ROUTE_ACCESS['/api-spec'] = ['Admin'];

const ROUTE_KEYS = Object.keys(ROUTE_ACCESS).sort((a, b) => b.length - a.length);

export function isUserRole(value: string | undefined): value is UserRole {
  return (
    value === 'Admin'
    || value === 'Manager'
    || value === 'Supervisor'
    || value === 'Finance'
    || value === 'Service'
    || value === 'Bartender'
    || value === 'Cashier'
  );
}

/** Floor ops, menu, stock, bookings. Deletes and venue settings stay Admin. */
export function isManagerLevel(role: UserRole): boolean {
  return role === 'Admin' || role === 'Manager' || role === 'Supervisor';
}

export function isFinanceLevel(role: UserRole): boolean {
  return isManagerLevel(role) || role === 'Finance';
}

export function isServiceLevel(role: UserRole): boolean {
  return isManagerLevel(role) || role === 'Service' || role === 'Bartender' || role === 'Cashier';
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

  // Finance and Service only open the pages listed for them.
  if (role === 'Finance' || role === 'Service') return false;

  // Unknown routes — allow any other authenticated role (prevents redirect traps on new pages)
  return true;
}

/** Returns a path to redirect to, or null if the current path is fine. Client-only. */
export function getAuthRedirect(pathname: string): string | null {
  if (typeof window === 'undefined') return null;

  const isPublic = PUBLIC_PATHS.has(pathname);
  const token = getAuthToken();

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
    return role === 'Finance' ? '/reports' : '/';
  }

  if (!canAccessRoute(pathname, role)) {
    return role === 'Finance' ? '/reports' : '/';
  }

  return null;
}
