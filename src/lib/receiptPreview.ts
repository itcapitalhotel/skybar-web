import type { PaymentMethod, ProcessPaymentResponse } from '@/lib/api/types';

export interface ReceiptLineItem {
  name: string;
  qty: number;
  unitPrice: number;
  size?: string;
  notes?: string;
}

export interface ReceiptPreviewData {
  paymentId?: string;
  tableId?: string;
  tableLabel?: string;
  zoneLabel?: string;
  openedAt?: string;
  closedAt?: string;
  items: ReceiptLineItem[];
  subtotal: number;
  serviceCharge: number;
  vat: number;
  discount?: number;
  total: number;
  method: PaymentMethod;
  cashTendered?: number | null;
  change?: number;
  roomNumber?: string | null;
  staffName?: string;
}

export type ReceiptPaperWidth = '58mm' | '80mm';

export const RECEIPT_PAPER_WIDTH_PX: Record<ReceiptPaperWidth, number> = {
  '58mm': 302,
  '80mm': 576,
};

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      name: String(o.name ?? 'Item'),
      qty: num(o.qty) ?? 1,
      unitPrice: num(o.unitPrice ?? o.unit_price) ?? 0,
      size: o.size != null ? String(o.size) : undefined,
      notes: o.notes != null ? String(o.notes) : undefined,
    };
  });
}

/** Map GET /api/receipts/{paymentId} (or payment response + items) into preview data. */
export function mapReceiptApiToPreview(raw: Record<string, unknown>): ReceiptPreviewData {
  const method = (raw.method as PaymentMethod) ?? 'card';
  return {
    paymentId: raw.paymentId != null ? String(raw.paymentId) : undefined,
    tableId: raw.tableId != null ? String(raw.tableId) : undefined,
    tableLabel: raw.tableLabel != null ? String(raw.tableLabel) : undefined,
    zoneLabel: raw.zoneLabel != null ? String(raw.zoneLabel) : undefined,
    openedAt: raw.openedAt != null ? String(raw.openedAt) : undefined,
    closedAt: raw.closedAt != null ? String(raw.closedAt) : undefined,
    items: mapItems(raw.items),
    subtotal: num(raw.subtotal) ?? 0,
    serviceCharge: num(raw.serviceCharge ?? raw.service_charge) ?? 0,
    vat: num(raw.vat) ?? 0,
    discount: num(raw.discount) ?? 0,
    total: num(raw.total) ?? 0,
    method,
    cashTendered: num(raw.cashTendered ?? raw.cash_tendered) ?? null,
    change: num(raw.change ?? raw.changeAmount ?? raw.change_amount) ?? 0,
    roomNumber: raw.roomNumber != null ? String(raw.roomNumber) : null,
    staffName: raw.staffName != null ? String(raw.staffName) : undefined,
  };
}

export function mapProcessPaymentToPreview(res: ProcessPaymentResponse & { items?: unknown[] }): ReceiptPreviewData {
  return mapReceiptApiToPreview(res as unknown as Record<string, unknown>);
}

/** Demo ticket for Admin → Receipt Layout when no paymentId is loaded. */
export const SAMPLE_RECEIPT_PREVIEW: ReceiptPreviewData = {
  paymentId: 'preview-sample',
  tableLabel: 'VIP-03',
  zoneLabel: 'Edge Skyline',
  items: [
    { name: 'Signature Sunset', qty: 2, unitPrice: 22, size: 'Single' },
    { name: 'Truffle Fries', qty: 1, unitPrice: 18, notes: 'No salt' },
    { name: 'Don Julio 1942', qty: 1, unitPrice: 48, size: 'Double' },
  ],
  subtotal: 110,
  serviceCharge: 11,
  vat: 8.47,
  discount: 0,
  total: 129.47,
  method: 'cash',
  cashTendered: 140,
  change: 10.53,
};
