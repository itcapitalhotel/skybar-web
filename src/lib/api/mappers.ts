import type { ApiMenuItem, MenuItem, ZoneData } from './types';
import type { ZoneMeta } from '@/app/components/floorData';

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
  return items.filter(i => i.available !== false).map(mapMenuItem);
}

export function zoneToMeta(zone: ZoneData): ZoneMeta {
  const id = zone.id.toLowerCase();
  const zoneKey = (['vip', 'bar', 'terrace', 'cabana'].includes(id) ? id : 'bar') as ZoneMeta['id'];
  return {
    id: zoneKey,
    label: zone.label,
    color: zone.color,
    accentColor: `${zone.color}14`,
    description: zone.description,
    canvasWidth: zone.canvasWidth,
    canvasHeight: zone.canvasHeight,
  };
}

export function normalizeNotification<T extends { createdAt?: string; timestamp?: string }>(n: T): T & { timestamp: string } {
  return { ...n, timestamp: n.timestamp ?? n.createdAt ?? new Date().toISOString() };
}
