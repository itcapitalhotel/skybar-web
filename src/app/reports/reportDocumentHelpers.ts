import { lineTotal } from '@/lib/receiptMoney';
import type { AnalyticsTransactionDetail, OrderItem } from '@/lib/api/types';

export function formatReportMoney(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `$${n.toFixed(2)}`;
}

export function shortOrderLabel(detail: AnalyticsTransactionDetail): string {
  const raw = detail.orderId ?? detail.paymentId ?? '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 3) return `#${digits.slice(-4)}`;
  return raw ? `#${raw.slice(0, 8)}` : '—';
}

export function paymentMethodDisplay(method: string): string {
  const m = method.trim().toLowerCase();
  if (m.includes('room')) return 'room_charge';
  if (m.includes('cash')) return 'cash';
  if (m.includes('card')) return 'card';
  if (m.includes('qr')) return 'qr';
  return method || '—';
}

export function fmtReportDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export interface FinancialTotals {
  subtotal: number;
  serviceCharge: number;
  vat: number;
  tips: number;
  grandTotal: number;
}

export function aggregateFinancials(details: AnalyticsTransactionDetail[]): FinancialTotals {
  let subtotal = 0;
  let serviceCharge = 0;
  let vat = 0;
  let tips = 0;
  let grandTotal = 0;
  for (const d of details) {
    const raw = d as unknown as Record<string, unknown>;
    subtotal += Number(d.subtotal ?? raw.subtotal ?? 0);
    serviceCharge += Number(d.serviceCharge ?? raw.service_charge ?? 0);
    vat += Number(d.vat ?? 0);
    tips += Number(raw.tips ?? raw.tip ?? 0);
    grandTotal += Number(d.total ?? d.amount ?? 0);
  }
  if (grandTotal > 0 && subtotal === 0 && serviceCharge === 0 && vat === 0) {
    subtotal = grandTotal;
  }
  return { subtotal, serviceCharge, vat, tips, grandTotal };
}

export interface PaymentBreakdownRow {
  method: string;
  orders: number;
  total: number;
}

export function paymentMethodBreakdown(details: AnalyticsTransactionDetail[]): PaymentBreakdownRow[] {
  const map = new Map<string, { orders: number; total: number }>();
  for (const d of details) {
    const key = paymentMethodDisplay(d.method);
    const prev = map.get(key) ?? { orders: 0, total: 0 };
    prev.orders += 1;
    prev.total += Number(d.total ?? d.amount ?? 0);
    map.set(key, prev);
  }
  return Array.from(map.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total);
}

export interface ReportGridRow {
  key: string;
  orderLabel: string;
  tableLabel: string;
  guests: number;
  itemName: string;
  qty: number;
  unitPrice: number;
  itemTotal: number;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  orderTotal: number;
  payment: string;
  status: string;
  openedAt: string;
  closedAt: string;
  paymentId: string;
  isOrderSummaryOnly?: boolean;
}

function orderItems(detail: AnalyticsTransactionDetail): OrderItem[] {
  if (detail.items?.length) return detail.items;
  return [];
}

export function buildReportGridRows(details: AnalyticsTransactionDetail[]): ReportGridRow[] {
  const rows: ReportGridRow[] = [];
  for (const d of details) {
    const items = orderItems(d);
    const subtotal = Number(d.subtotal ?? 0);
    const serviceCharge = Number(d.serviceCharge ?? 0);
    const vat = Number(d.vat ?? 0);
    const orderTotal = Number(d.total ?? d.amount ?? 0);
    const guests = Number(d.guestCount ?? d.covers ?? 1) || 1;
    const base = {
      orderLabel: shortOrderLabel(d),
      tableLabel: d.tableLabel || 'N/A',
      guests,
      subtotal: subtotal || orderTotal,
      serviceCharge,
      vat,
      orderTotal,
      payment: paymentMethodDisplay(d.method),
      status: 'DONE',
      openedAt: fmtReportDateTime(d.openedAt),
      closedAt: fmtReportDateTime(d.closedAt ?? d.time),
      paymentId: d.paymentId,
    };

    if (items.length === 0) {
      rows.push({
        key: `${d.paymentId}-summary`,
        ...base,
        itemName: '(No line items in API)',
        qty: 0,
        unitPrice: 0,
        itemTotal: 0,
        isOrderSummaryOnly: true,
      });
      continue;
    }

    items.forEach((item, idx) => {
      const qty = item.qty ?? 1;
      const unitPrice = item.unitPrice ?? 0;
      const itemTotal = lineTotal(qty, unitPrice);
      const isLast = idx === items.length - 1;
      rows.push({
        key: `${d.paymentId}-${item.id || idx}`,
        ...base,
        itemName: item.size ? `${item.name} (${item.size})` : item.name,
        qty,
        unitPrice,
        itemTotal,
        subtotal: isLast ? base.subtotal : 0,
        serviceCharge: isLast ? base.serviceCharge : 0,
        vat: isLast ? base.vat : 0,
        orderTotal: isLast ? base.orderTotal : 0,
        payment: isLast ? base.payment : '',
        status: isLast ? base.status : '',
        openedAt: isLast ? base.openedAt : '',
        closedAt: isLast ? base.closedAt : '',
      });
    });
  }
  return rows;
}

export function gridColumnTotals(rows: ReportGridRow[]) {
  return rows.reduce(
    (acc, r) => {
      if (r.subtotal > 0 || r.isOrderSummaryOnly) acc.subtotal += r.subtotal;
      if (r.serviceCharge > 0 || r.isOrderSummaryOnly) acc.serviceCharge += r.serviceCharge;
      if (r.vat > 0 || r.isOrderSummaryOnly) acc.vat += r.vat;
      if (r.orderTotal > 0 || r.isOrderSummaryOnly) acc.orderTotal += r.orderTotal;
      return acc;
    },
    { subtotal: 0, serviceCharge: 0, vat: 0, orderTotal: 0 },
  );
}

function csvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',');
}

function moneyCsv(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

/** CSV export matching on-screen / print SkyBar Shop Report layout. */
export function buildShopReportCsv(
  orderDetails: AnalyticsTransactionDetail[],
  dateFrom: string,
  dateTo: string,
  generatedAt: Date,
): string {
  const lines: string[] = [];
  const financial = aggregateFinancials(orderDetails);
  const paymentRows = paymentMethodBreakdown(orderDetails);
  const gridRows = buildReportGridRows(orderDetails);
  const colTotals = gridColumnTotals(gridRows);
  const totalOrders = orderDetails.length;
  const totalGuests = orderDetails.reduce(
    (s, d) => s + (Number(d.guestCount ?? d.covers ?? 1) || 1),
    0,
  );
  const generatedLabel = generatedAt.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  lines.push(csvRow(['SkyBar Report']));
  lines.push(csvRow([`Date Range: ${dateFrom} to ${dateTo}`]));
  lines.push(csvRow([`Generated on: ${generatedLabel}`]));
  lines.push('');

  lines.push(csvRow(['Summary']));
  lines.push(csvRow(['Total Orders', totalOrders]));
  lines.push(csvRow(['Total Guests', totalGuests]));
  lines.push('');

  lines.push(csvRow(['Financial Summary']));
  lines.push(csvRow(['Label', 'Amount']));
  lines.push(csvRow(['Subtotal', moneyCsv(financial.subtotal)]));
  lines.push(csvRow(['Service Charge', moneyCsv(financial.serviceCharge)]));
  lines.push(csvRow(['VAT', moneyCsv(financial.vat)]));
  lines.push(csvRow(['Tips', moneyCsv(financial.tips)]));
  lines.push(csvRow(['Grand Total', moneyCsv(financial.grandTotal)]));
  lines.push('');

  lines.push(csvRow(['Payment Method Breakdown']));
  lines.push(csvRow(['Payment Method', 'Orders', 'Total Amount']));
  let payOrders = 0;
  let payTotal = 0;
  for (const r of paymentRows) {
    lines.push(csvRow([r.method, r.orders, moneyCsv(r.total)]));
    payOrders += r.orders;
    payTotal += r.total;
  }
  if (paymentRows.length > 0) {
    lines.push(csvRow(['TOTAL', payOrders, moneyCsv(payTotal)]));
  }
  lines.push('');

  lines.push(csvRow(['Transaction Details']));
  lines.push(
    csvRow([
      'Order ID',
      'Table',
      'Guests',
      'Items',
      'Qty',
      'Price',
      'Item Total',
      'Subtotal',
      'Service Charge',
      'VAT',
      'Total',
      'Payment',
      'Status',
      'Opening Time',
      'Closing Time',
    ]),
  );

  for (const row of gridRows) {
    const showFin =
      row.isOrderSummaryOnly || Boolean(row.payment && row.status);
    lines.push(
      csvRow([
        row.orderLabel,
        row.tableLabel,
        row.guests,
        row.itemName,
        row.qty || '',
        row.qty ? moneyCsv(row.unitPrice) : '',
        row.qty ? moneyCsv(row.itemTotal) : '',
        showFin ? moneyCsv(row.subtotal) : '',
        showFin ? moneyCsv(row.serviceCharge) : '',
        showFin ? moneyCsv(row.vat) : '',
        showFin ? moneyCsv(row.orderTotal) : '',
        row.payment,
        row.status,
        row.openedAt,
        row.closedAt,
      ]),
    );
  }

  if (gridRows.length > 0) {
    lines.push(
      csvRow([
        'TOTALS:',
        '',
        '',
        '',
        '',
        '',
        '',
        moneyCsv(colTotals.subtotal),
        moneyCsv(colTotals.serviceCharge),
        moneyCsv(colTotals.vat),
        moneyCsv(colTotals.orderTotal),
        '',
        '',
        '',
        '',
      ]),
    );
  }

  return lines.join('\r\n');
}
