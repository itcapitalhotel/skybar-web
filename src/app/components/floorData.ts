export type TableStatus = 'available' | 'occupied' | 'reserved' | 'bill';
export type TableShape = 'circle' | 'rect' | 'cabana' | 'stool';
export type OrderItemStatus = 'Queued' | 'In Prep' | 'Ready' | 'Served' | 'Voided';

export interface TableData {
  id: string;
  label: string;
  /** Zone id from GET /zones (and table.zone) — not a display label */
  zone: string;
  status: TableStatus;
  guests: number;
  capacity: number;
  staff: string;
  seatedMinutes: number;
  minSpend?: number;
  orderTotal: number;
  shape: TableShape;
  x: number;
  y: number;
}

export interface ZoneMeta {
  id: string;
  label: string;
  color: string;
  accentColor: string;
  description: string;
  canvasWidth: number;
  canvasHeight: number;
}

export interface OrderItem {
  id: string;
  /** Catalog menu item id — required when posting to API */
  menuItemId?: string;
  categoryId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  status: OrderItemStatus;
  notes?: string;
  size?: string;
}

export function formatTimer(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

export function calcOrderTotal(items: OrderItem[]): number {
  return items.reduce((acc, i) => (i.status !== 'Voided' ? acc + i.unitPrice * i.qty : acc), 0);
}
