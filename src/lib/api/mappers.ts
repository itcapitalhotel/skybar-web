import type { ApiMenuItem, MenuItem, ZoneData } from './types';
import type { ZoneMeta } from '@/app/components/floorData';

/** Menu ids are numbers stored as text ("1", "2", "10"). Compare the number so 2 stays before 10. */
export function compareMenuItemId(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aText = String(a ?? '').trim();
  const bText = String(b ?? '').trim();
  const aNum = /^\d+$/.test(aText) ? Number(aText) : Number.POSITIVE_INFINITY;
  const bNum = /^\d+$/.test(bText) ? Number(bText) : Number.POSITIVE_INFINITY;
  if (aNum !== bNum) return aNum - bNum;
  return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
}

export function mapMenuItem(item: ApiMenuItem): MenuItem {
  const defaultPrice = item.sizes?.[0]?.price ?? 0;
  const slug = item.category ?? item.categoryId;
  return {
    id: item.id,
    name: item.name,
    price: defaultPrice,
    categoryId: item.categoryId,
    category: slug,
    description: item.description,
    popular: item.popular,
    image: item.image,
    sizes: item.sizes,
    available: item.available ?? true,
  };
}

export function mapMenuItems(items: ApiMenuItem[]): MenuItem[] {
  return items
    .filter(i => i.available !== false)
    .map(mapMenuItem)
    .sort((a, b) => compareMenuItemId(a.id, b.id));
}

export function zoneToMeta(zone: ZoneData): ZoneMeta {
  const color = zone.color || '#06b6d4';
  return {
    id: zone.id,
    label: zone.label,
    color,
    accentColor: `${color}14`,
    description: zone.description,
    canvasWidth: zone.canvasWidth || 1200,
    canvasHeight: zone.canvasHeight || 800,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Map one GET/POST /zones payload (camelCase or snake_case). */
export function normalizeZone(raw: unknown): ZoneData | null {
  const z = asRecord(raw);
  if (!z) return null;
  const id = String(z.id ?? z.zoneId ?? z.zone_id ?? '').trim();
  if (!id) return null;
  const active = z.isActive ?? z.active ?? z.is_active;
  return {
    id,
    label: String(z.label ?? z.name ?? id),
    description: String(z.description ?? ''),
    color: String(z.color ?? '#06b6d4'),
    tableCount: Number(z.tableCount ?? z.table_count ?? 0) || 0,
    capacity: Number(z.capacity ?? 0) || 0,
    isActive: active !== false && active !== 'false' && active !== 0,
    canvasWidth: Number(z.canvasWidth ?? z.canvas_width ?? 1200) || 1200,
    canvasHeight: Number(z.canvasHeight ?? z.canvas_height ?? 800) || 800,
  };
}

/** Unwrap list/page wrappers from GET /zones. */
export function normalizeZoneList(raw: unknown): ZoneData[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeZone).filter((z): z is ZoneData => z != null);
  }
  const o = asRecord(raw);
  if (!o) return [];
  const nested = o.content ?? o.data ?? o.zones ?? o.items ?? o.results;
  if (Array.isArray(nested)) {
    return nested.map(normalizeZone).filter((z): z is ZoneData => z != null);
  }
  const single = normalizeZone(raw);
  return single ? [single] : [];
}

export function normalizeNotification<T extends { createdAt?: string; timestamp?: string }>(n: T): T & { timestamp: string } {
  return { ...n, timestamp: n.timestamp ?? n.createdAt ?? new Date().toISOString() };
}
