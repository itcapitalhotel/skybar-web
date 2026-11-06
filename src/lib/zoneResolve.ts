import type { TableData, ZoneData } from '@/lib/api/types';

export interface ResolvedZone {
  zoneId: string;
  zone: string;
  color: string;
}

/** Common floor slugs used by tables when zone ids are short codes. */
const ZONE_SLUG_ALIASES: Record<string, string[]> = {
  vip: ['vip', 'vipedge', 'vipedgeskyline'],
  bar: ['bar', 'mainbar'],
  terrace: ['terrace', 'outdoor', 'outdoorterrace'],
  cabana: ['cabana', 'cabanadeck'],
};

function norm(value: string | undefined | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function slugFamily(rawKey: string): string | undefined {
  const key = norm(rawKey);
  if (!key) return undefined;
  for (const [family, aliases] of Object.entries(ZONE_SLUG_ALIASES)) {
    if (key === family || aliases.includes(key)) return family;
  }
  // e.g. vipedgeskyline → vip
  for (const [family, aliases] of Object.entries(ZONE_SLUG_ALIASES)) {
    if (aliases.some((a) => a.length >= 3 && (key.includes(a) || a.includes(key)))) {
      return family;
    }
  }
  return undefined;
}

/** Match raw zone id/slug/label to a configured zone (strict + known aliases only). */
export function findZone(zones: ZoneData[], raw: string | undefined | null): ZoneData | undefined {
  const s = String(raw ?? '').trim();
  if (!s || zones.length === 0) return undefined;

  const key = norm(s);

  const exact =
    zones.find((z) => z.id === s) ||
    zones.find((z) => z.label === s) ||
    zones.find((z) => norm(z.id) === key) ||
    zones.find((z) => norm(z.label) === key);
  if (exact) return exact;

  const family = slugFamily(s);
  if (!family) return undefined;

  return (
    zones.find((z) => slugFamily(z.id) === family) ||
    zones.find((z) => slugFamily(z.label) === family) ||
    zones.find((z) => norm(z.id) === family) ||
    zones.find((z) => norm(z.label).startsWith(family))
  );
}

export function resolvedFromZone(zone: ZoneData, fallbackColor = '#64748b'): ResolvedZone {
  return {
    zoneId: zone.id || norm(zone.label) || 'unknown',
    zone: zone.label || zone.id,
    color: zone.color || fallbackColor,
  };
}

export function tableLookupKeys(table: Pick<TableData, 'id' | 'label'>): string[] {
  const keys = new Set<string>();
  const add = (v: string | undefined | null) => {
    const s = String(v ?? '').trim();
    if (!s) return;
    keys.add(s);
    keys.add(s.toLowerCase());
  };

  add(table.id);
  add(table.label);

  const label = String(table.label ?? '').trim();
  if (label) {
    const stripped = label.replace(/^tables?\s+/i, '').trim();
    add(stripped);
    add(`Table ${stripped}`);
    add(`TABLE ${stripped}`);
  }
  return [...keys];
}

/** Normalize API table rows that may send zoneId instead of zone. */
export function normalizeTableRow(table: TableData): TableData {
  const raw = table as unknown as Record<string, unknown>;
  const zone = String(
    table.zone || raw.zoneId || raw.zone_id || raw.zoneLabel || raw.zone_label || '',
  ).trim();
  return { ...table, zone };
}

/** tableId / tableLabel → canonical zone id + label + color */
export function buildTableZoneLookup(
  tables: TableData[],
  zones: ZoneData[],
  fallbackColors: string[] = ['#f59e0b', '#06b6d4', '#10b981', '#a855f7', '#ec4899', '#64748b'],
): Map<string, ResolvedZone> {
  const lookup = new Map<string, ResolvedZone>();
  let colorIdx = 0;

  for (const rawTable of tables) {
    const table = normalizeTableRow(rawTable);
    const matched = findZone(zones, table.zone);
    const resolved: ResolvedZone = matched
      ? resolvedFromZone(matched)
      : {
          zoneId: norm(table.zone) || 'other',
          zone: table.zone || 'Other',
          color: fallbackColors[colorIdx++ % fallbackColors.length],
        };

    // Prefer table id keys — never let label collisions overwrite a different table id
    if (table.id) {
      lookup.set(table.id, resolved);
      lookup.set(table.id.toLowerCase(), resolved);
    }
    for (const key of tableLookupKeys(table)) {
      if (key === table.id || key === table.id?.toLowerCase()) continue;
      // Label keys only if not already claimed by another table id mapping
      if (!lookup.has(key)) lookup.set(key, resolved);
    }
  }

  return lookup;
}

export function resolveZoneFromFields(
  fields: {
    zoneId?: string | null;
    zoneLabel?: string | null;
    zone?: string | null;
    tableId?: string | null;
    tableLabel?: string | null;
  },
  lookup: Map<string, ResolvedZone>,
  zones: ZoneData[],
): ResolvedZone {
  const fromZone =
    findZone(zones, fields.zoneId) ||
    findZone(zones, fields.zoneLabel) ||
    findZone(zones, fields.zone);
  if (fromZone) return resolvedFromZone(fromZone);

  // Prefer exact table id match before label (labels collide across zones)
  const tableId = String(fields.tableId ?? '').trim();
  if (tableId) {
    const byId = lookup.get(tableId) || lookup.get(tableId.toLowerCase());
    if (byId) return byId;
  }

  const tableKeys = [
    fields.tableLabel,
    String(fields.tableLabel ?? '').replace(/^tables?\s+/i, '').trim(),
    fields.tableLabel ? `Table ${String(fields.tableLabel).replace(/^tables?\s+/i, '').trim()}` : '',
  ];
  for (const key of tableKeys) {
    const s = String(key ?? '').trim();
    if (!s) continue;
    const hit = lookup.get(s) || lookup.get(s.toLowerCase());
    if (hit) return hit;
  }

  return { zoneId: 'other', zone: 'Other', color: '#64748b' };
}

export function zonesMatch(
  txn: { zoneId?: string; zone?: string },
  selected: { zoneId?: string; zone?: string },
): boolean {
  if (selected.zoneId && txn.zoneId && selected.zoneId === txn.zoneId) return true;
  if (selected.zone && txn.zone && selected.zone === txn.zone) return true;
  if (selected.zoneId && txn.zoneId && norm(selected.zoneId) === norm(txn.zoneId)) return true;
  if (selected.zone && txn.zone && norm(selected.zone) === norm(txn.zone)) return true;
  const a = slugFamily(selected.zoneId || selected.zone || '');
  const b = slugFamily(txn.zoneId || txn.zone || '');
  return Boolean(a && b && a === b);
}
