import { getAuthUser } from '@/lib/api/config';
import { staffApi, usersApi } from '@/lib/api/client';

let nameById: Record<string, string> = {};

/** Staff user id for order/KDS API — backend expects id (e.g. u2), not display name. */
export function getStaffIdForOrder(): string {
  return getAuthUser()?.id ?? '';
}

export function getStaffNameForDisplay(): string {
  const user = getAuthUser();
  return user?.name ?? user?.id ?? 'Staff';
}

/** Backend placeholder when staff join fails — treat as missing. */
export function isPlaceholderStaffLabel(value: string | undefined | null): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return !v || v === 'unknown' || v === 'n/a' || v === 'na' || v === '—' || v === '-';
}

export async function ensureStaffNameCache(options?: { force?: boolean }): Promise<void> {
  if (!options?.force && Object.keys(nameById).length > 0) return;

  const merged: Record<string, string> = { ...nameById };

  try {
    const list = await staffApi.list();
    for (const s of list) merged[s.id] = s.name;
  } catch {
    /* Admin-only — fall back to /users for Manager reports */
  }

  try {
    const users = await usersApi.list();
    for (const u of users) merged[u.id] = u.name;
  } catch {
    /* keep partial cache */
  }

  nameById = merged;
}

/** Normalize staff id/name from API JSON (camelCase or snake_case). */
export function pickStaffFields(raw: Record<string, unknown>): { staffId: string; staffName: string } {
  let staffId = String(
    raw.staffId ?? raw.staff_id ?? raw.cashierId ?? raw.cashier_id ?? raw.openedByStaffId ?? '',
  ).trim();
  const staffLegacy = String(raw.staff ?? raw.cashier ?? raw.cashierName ?? '').trim();

  // `staff` is often a display name or "unknown" — only use as id when it looks like u2 / UUID
  if (!staffId && staffLegacy && /^u[\w-]+$/i.test(staffLegacy)) {
    staffId = staffLegacy;
  }

  let staffName = String(raw.name ?? raw.staffName ?? raw.staff_name ?? raw.cashierName ?? '').trim();
  if (!staffName && staffLegacy && !/^u[\w-]+$/i.test(staffLegacy)) {
    staffName = staffLegacy;
  }

  if (staffId && isPlaceholderStaffLabel(staffId)) staffId = '';

  return { staffId, staffName };
}

/** Final label for UI — never show backend placeholder strings. */
export function finalizeStaffDisplay(resolved: string, staffId?: string): string {
  if (resolved && resolved !== '—' && !isPlaceholderStaffLabel(resolved)) return resolved;
  const id = String(staffId ?? '').trim();
  if (id && nameById[id]) return nameById[id];
  if (id && !isPlaceholderStaffLabel(id)) return id;
  return 'Unassigned';
}

export function registerStaffNames(entries: Record<string, string>): void {
  nameById = { ...nameById, ...entries };
}

/** Resolve staff label from API fields (staffId, staffName, or legacy staff string). */
export function resolveStaffDisplay(raw: Record<string, unknown>): string {
  const { staffId: id, staffName: explicitFromPick } = pickStaffFields(raw);
  const explicit = String(raw.staffName ?? raw.staff_name ?? explicitFromPick ?? '').trim();

  if (explicit && !isPlaceholderStaffLabel(explicit)) return explicit;

  if (id && nameById[id]) return nameById[id];

  // If staff is already a human name (not an id), use it
  if (
    id &&
    !/^u[\w-]+$/i.test(id) &&
    !isPlaceholderStaffLabel(id) &&
    id !== 'Staff'
  ) {
    return id;
  }

  if (id && !isPlaceholderStaffLabel(id)) return nameById[id] ?? id;
  return '—';
}
