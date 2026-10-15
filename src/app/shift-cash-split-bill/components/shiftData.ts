import { shiftApi, dashboardApi } from '@/lib/api/client';
import { ensureStaffNameCache, resolveStaffDisplay } from '@/lib/staffDisplay';
import type {
  ShiftSummary,
  HourlyRevenue,
  RecentTransaction,
  DrawerCount,
  HourlyZoneRevenue,
  PaymentBreakdown,
} from '@/lib/api/types';

export type { ShiftSummary, HourlyRevenue, RecentTransaction, DrawerCount };

export const EMPTY_SHIFT: ShiftSummary = {
  shiftId: '',
  openedAt: '',
  cashier: '',
  terminal: '',
  openingFloat: 0,
  cashSales: 0,
  cardSales: 0,
  qrSales: 0,
  roomChargeSales: 0,
  voids: 0,
  discounts: 0,
  covers: 0,
  transactions: 0,
};

export const DRAWER_DENOMINATIONS: DrawerCount[] = [
  { denomination: '$100', value: 100, count: 0 },
  { denomination: '$50', value: 50, count: 0 },
  { denomination: '$20', value: 20, count: 0 },
  { denomination: '$10', value: 10, count: 0 },
  { denomination: '$5', value: 5, count: 0 },
  { denomination: '$1', value: 1, count: 0 },
  { denomination: '¢25', value: 0.25, count: 0 },
  { denomination: '¢10', value: 0.10, count: 0 },
  { denomination: '¢5', value: 0.05, count: 0 },
  { denomination: '¢1', value: 0.01, count: 0 },
];

/** Map backend shift fields (camelCase or snake_case) to frontend shape. */
export function normalizeShift(raw: Record<string, unknown>): ShiftSummary {
  const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
  return {
    shiftId: String(raw.shiftId ?? raw.id ?? ''),
    openedAt: String(raw.openedAt ?? raw.opened_at ?? ''),
    cashier: String(raw.cashier ?? raw.cashierName ?? raw.staffName ?? ''),
    terminal: String(raw.terminal ?? raw.terminalId ?? ''),
    openingFloat: num(raw.openingFloat ?? raw.opening_float),
    cashSales: num(raw.cashSales ?? raw.cash_sales),
    cardSales: num(raw.cardSales ?? raw.card_sales),
    qrSales: num(raw.qrSales ?? raw.qr_sales),
    roomChargeSales: num(raw.roomChargeSales ?? raw.room_charge_sales ?? raw.roomSales),
    voids: num(raw.voids),
    discounts: num(raw.discounts),
    covers: num(raw.covers),
    transactions: num(raw.transactions ?? raw.transactionCount),
  };
}

export function normalizeTransaction(raw: Record<string, unknown>): RecentTransaction {
  const methodRaw = String(raw.method ?? 'Cash');
  const method = (['Cash', 'Card', 'QR', 'Room'].includes(methodRaw)
    ? methodRaw
    : methodRaw.charAt(0).toUpperCase() + methodRaw.slice(1).toLowerCase()) as RecentTransaction['method'];

  return {
    id: String(raw.id ?? ''),
    tableId: raw.tableId != null ? String(raw.tableId) : undefined,
    tableLabel: String(raw.tableLabel ?? raw.table_label ?? '—'),
    amount: Number(raw.amount ?? 0),
    method,
    time: String(raw.time ?? raw.timestamp ?? ''),
    staff: resolveStaffDisplay(raw),
    items: raw.items != null ? Number(raw.items) : undefined,
    covers: raw.covers != null ? Number(raw.covers) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
  };
}

/** Dashboard hourly-by-zone → simple hour totals for close-shift chart. */
export function hourlyZoneToRevenue(rows: HourlyZoneRevenue[]): HourlyRevenue[] {
  return rows.map((row) => {
    const zoneTotal =
      (row.vip ?? 0) + (row.bar ?? 0) + (row.terrace ?? 0) + (row.cabana ?? 0);
    return {
      hour: row.hour,
      revenue: row.revenue ?? zoneTotal,
      cash: row.cash,
      card: row.card,
      qr: row.qr,
    };
  });
}

export function paymentBreakdownToTotals(items: PaymentBreakdown[]) {
  const find = (names: string[]) =>
    items.find((p) => names.some((n) => p.name.toLowerCase().includes(n.toLowerCase())))?.value ?? 0;

  return {
    cash: find(['cash']),
    card: find(['card']),
    qr: find(['qr', 'mobile']),
    room: find(['room']),
  };
}

export async function fetchCurrentShift(): Promise<ShiftSummary> {
  try {
    const raw = await shiftApi.current();
    const shift = normalizeShift(raw as unknown as Record<string, unknown>);
    return shift.shiftId ? shift : EMPTY_SHIFT;
  } catch {
    return EMPTY_SHIFT;
  }
}

export async function fetchHourlyRevenue(): Promise<HourlyRevenue[]> {
  try {
    const rows = await dashboardApi.hourlyRevenue();
    return hourlyZoneToRevenue(rows);
  } catch {
    return [];
  }
}

export async function fetchRecentTransactions(shiftId?: string): Promise<RecentTransaction[]> {
  try {
    await ensureStaffNameCache();
    const id = shiftId ?? (await fetchCurrentShift()).shiftId;
    if (!id) return [];
    const rows = await shiftApi.transactions(id);
    return (rows as unknown as Record<string, unknown>[]).map(normalizeTransaction);
  } catch {
    return [];
  }
}

export async function fetchDrawerDenominations(): Promise<DrawerCount[]> {
  return DRAWER_DENOMINATIONS;
}

export async function fetchPaymentBreakdown(): Promise<PaymentBreakdown[]> {
  try {
    return await dashboardApi.paymentBreakdown();
  } catch {
    return [];
  }
}
