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

function scalarOrFromStaffObject(
  v: unknown,
  pick: 'id' | 'name',
): string {
  if (v == null) return '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (pick === 'id') {
      const id = o.id ?? o.staffId ?? o.userId;
      if (id != null && typeof id !== 'object') return String(id).trim();
      return '';
    }
    const name = o.name ?? o.staffName ?? o.displayName;
    if (name != null && typeof name !== 'object') return String(name).trim();
    return '';
  }
  const s = String(v).trim();
  if (!s || s === '[object Object]') return '';
  return s;
}

/** Normalize staff id/name from API JSON (camelCase or snake_case). */
export function pickStaffFields(raw: Record<string, unknown>): { staffId: string; staffName: string } {
  let staffId =
    scalarOrFromStaffObject(raw.staffId, 'id')
    || scalarOrFromStaffObject(raw.staff_id, 'id')
    || scalarOrFromStaffObject(raw.staff, 'id')
    || scalarOrFromStaffObject(raw.openedByStaffId, 'id')
    || scalarOrFromStaffObject(raw.openedBy, 'id')
    || scalarOrFromStaffObject(raw.cashierId, 'id')
    || scalarOrFromStaffObject(raw.cashier, 'id')
    || '';

  const staffLegacy = scalarOrFromStaffObject(raw.staff, 'name')
    || scalarOrFromStaffObject(raw.cashier, 'name');

  if (!staffId && staffLegacy && /^u[\w-]+$/i.test(staffLegacy)) {
    staffId = staffLegacy;
  }

  let staffName =
    scalarOrFromStaffObject(raw.name, 'name')
    || scalarOrFromStaffObject(raw.staffName, 'name')
    || scalarOrFromStaffObject(raw.staff_name, 'name')
    || scalarOrFromStaffObject(raw.staff, 'name')
    || scalarOrFromStaffObject(raw.staffId, 'name')
    || scalarOrFromStaffObject(raw.openedByStaffName, 'name')
    || scalarOrFromStaffObject(raw.openedBy, 'name')
    || scalarOrFromStaffObject(raw.cashierName, 'name')
    || scalarOrFromStaffObject(raw.cashier, 'name')
    || '';

  if (!staffName && staffLegacy && !/^u[\w-]+$/i.test(staffLegacy)) {
    staffName = staffLegacy;
  }

  if (staffId && isPlaceholderStaffLabel(staffId)) staffId = '';
  if (staffName === '[object Object]') staffName = '';

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
  let explicit = String(raw.staffName ?? raw.staff_name ?? explicitFromPick ?? '').trim();
  if (explicit === '[object Object]') explicit = explicitFromPick;
  if (!explicit || explicit === '[object Object]') {
    explicit = scalarOrFromStaffObject(raw.staff, 'name') || scalarOrFromStaffObject(raw.staffId, 'name');
  }

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
