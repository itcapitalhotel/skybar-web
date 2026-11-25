import { lineTotal } from '@/lib/receiptMoney';
import { normalizeCategoryType } from '@/lib/menuCategory';
import type {
  AnalyticsTransactionDetail,
  ApiMenuItem,
  MenuCategory,
  MenuCategoryType,
  OrderItem,
} from '@/lib/api/types';

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

/** Payment column label — includes card brand + txn when method is card. */
export function paymentMethodDetailLabel(
  method: string,
  cardName?: string | null,
  cardNumber?: string | null,
): string {
  const base = paymentMethodDisplay(method);
  const m = (method || '').trim().toLowerCase();
  if (!m.includes('card') && base !== 'card') return base;
  const parts = [base === 'card' ? 'card' : base];
  const brand = cardName?.trim();
  const txn = cardNumber?.trim();
  if (brand) parts.push(brand);
  if (txn) parts.push(`Txn ${txn}`);
  return parts.join(' · ');
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
  /** Dollar discounts that were applied (a percent left at 0 is not included). */
  discount: number;
  /** Bill before discount (subtotal, service, and VAT). */
  billTotal: number;
  /** Amount collected after those discounts. */
  grandTotal: number;
}

export interface CategoryTypeSalesTotals {
  food: number;
  drink: number;
}

export interface MenuCategoryLookup {
  categoryTypeById: Record<string, MenuCategoryType>;
  menuItemCategoryId: Record<string, string>;
  /** menu catalog id → food | drink */
  menuItemIdToType: Record<string, MenuCategoryType>;
  /** normalized item name → food | drink */
  menuNameToType: Record<string, MenuCategoryType>;
}

export function normalizeReportItemName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/u, '').trim().toLowerCase();
}

export function buildMenuCategoryLookup(
  categories: MenuCategory[],
  menuItems: ApiMenuItem[],
): MenuCategoryLookup {
  const categoryTypeById = Object.fromEntries(categories.map((c) => [c.id, c.categoryType]));
  const categoryTypeByLabel = Object.fromEntries(
    categories.map((c) => [c.label.trim().toLowerCase(), c.categoryType]),
  );
  const menuItemCategoryId: Record<string, string> = {};
  const menuItemIdToType: Record<string, MenuCategoryType> = {};
  const menuNameToType: Record<string, MenuCategoryType> = {};

  for (const m of menuItems) {
    menuItemCategoryId[m.id] = m.categoryId;
    const catKey = m.categoryId || m.category || '';
    let type =
      categoryTypeById[catKey]
      ?? categoryTypeByLabel[String(m.category ?? '').trim().toLowerCase()];
    if (type) {
      menuItemIdToType[m.id] = type;
      menuNameToType[normalizeReportItemName(m.name)] = type;
    }
  }

  return { categoryTypeById, menuItemCategoryId, menuItemIdToType, menuNameToType };
}

export interface ReportLineItemLike {
  id?: string;
  name: string;
  qty: number;
  unitPrice: number;
  status?: string;
  menuItemId?: string;
  categoryId?: string;
  categoryType?: MenuCategoryType;
}

function resolveLineCategoryType(
  item: ReportLineItemLike,
  lookup: MenuCategoryLookup,
): MenuCategoryType | undefined {
  const raw = item as unknown as Record<string, unknown>;
  const fromApi = normalizeCategoryType(item.categoryType ?? raw.categoryType ?? raw.category_type);
  if (fromApi) return fromApi;

  const menuItemId = String(item.menuItemId ?? raw.menuItemId ?? raw.menu_item_id ?? '').trim();
  if (menuItemId && lookup.menuItemIdToType[menuItemId]) {
    return lookup.menuItemIdToType[menuItemId];
  }

  let categoryId = String(item.categoryId ?? raw.categoryId ?? raw.category_id ?? '').trim();
  if (!categoryId && menuItemId) {
    categoryId = lookup.menuItemCategoryId[menuItemId] ?? '';
  }
  if (categoryId && lookup.categoryTypeById[categoryId]) {
    return lookup.categoryTypeById[categoryId];
  }

  return lookup.menuNameToType[normalizeReportItemName(item.name)];
}

/** Sum line-item sales (excludes voided) by food vs drink. */
export function aggregateSalesFromLineItems(
  items: ReportLineItemLike[],
  lookup: MenuCategoryLookup | undefined,
): CategoryTypeSalesTotals {
  let food = 0;
  let drink = 0;
  if (!lookup) return { food, drink };

  for (const item of items) {
    if (item.status === 'Voided') continue;
    const categoryType = resolveLineCategoryType(item, lookup);
    const amount = lineTotal(item.qty ?? 1, item.unitPrice ?? 0);
    if (categoryType === 'food') food += amount;
    else if (categoryType === 'drink') drink += amount;
  }

  return { food, drink };
}

function paymentLevelCategorySales(detail: AnalyticsTransactionDetail): CategoryTypeSalesTotals {
  const raw = detail as unknown as Record<string, unknown>;
  const food = Number(raw.foodSubtotal ?? raw.food_subtotal ?? raw.foodSales ?? raw.food_sales ?? 0);
  const drink = Number(raw.drinkSubtotal ?? raw.drink_subtotal ?? raw.drinkSales ?? raw.drink_sales ?? 0);
  return {
    food: Number.isFinite(food) ? food : 0,
    drink: Number.isFinite(drink) ? drink : 0,
  };
}

/** Sum line-item sales (excludes voided) by menu category type food vs drink. */
export function aggregateSalesByCategoryType(
  details: AnalyticsTransactionDetail[],
  lookup: MenuCategoryLookup | undefined,
): CategoryTypeSalesTotals {
  let food = 0;
  let drink = 0;

  for (const d of uniqueChecks(details)) {
    const fromPayment = paymentLevelCategorySales(d);
    if (fromPayment.food > 0 || fromPayment.drink > 0) {
      food += fromPayment.food;
      drink += fromPayment.drink;
      continue;
    }
    const fromLines = aggregateSalesFromLineItems(orderItems(d), lookup);
    food += fromLines.food;
    drink += fromLines.drink;
  }

  return { food, drink };
}

export function aggregateFinancials(details: AnalyticsTransactionDetail[]): FinancialTotals {
  let subtotal = 0;
  let serviceCharge = 0;
  let vat = 0;
  let tips = 0;
  let discount = 0;
  let billTotal = 0;
  let grandTotal = 0;
  for (const d of uniqueChecks(details)) {
    const raw = d as unknown as Record<string, unknown>;
    subtotal += Number(d.subtotal ?? raw.subtotal ?? 0);
    serviceCharge += Number(d.serviceCharge ?? raw.service_charge ?? 0);
    vat += Number(d.vat ?? 0);
    tips += Number(d.tip ?? raw.tips ?? raw.tip ?? 0);
    discount += discountAmount(d);
    billTotal += grossBillTotal(d);
    grandTotal += chargedTotal(d);
  }
  if (grandTotal > 0 && subtotal === 0 && serviceCharge === 0 && vat === 0) {
    subtotal = billTotal || grandTotal;
  }
  return { subtotal, serviceCharge, vat, tips, discount, billTotal, grandTotal };
}

export interface PaymentBreakdownRow {
  method: string;
  orders: number;
  total: number;
  totalAfterDiscount: number;
}

export function paymentMethodBreakdown(details: AnalyticsTransactionDetail[]): PaymentBreakdownRow[] {
  const map = new Map<string, { orders: number; total: number; totalAfterDiscount: number }>();
  for (const detail of uniqueChecks(details)) {
    const payments = detail.payments?.length
      ? detail.payments
      : [{ method: detail.method, amount: chargedTotal(detail), cardName: detail.cardName }];
    for (const payment of payments) {
      const key = tenderDisplayName(payment.method, payment.cardName);
      if (key === '—') continue;
      const prev = map.get(key) ?? { orders: 0, total: 0, totalAfterDiscount: 0 };
      const amount = roundReportMoney(Number(payment.amount ?? 0));
      prev.orders += 1;
      prev.total += amount;
      prev.totalAfterDiscount += amount;
      map.set(key, prev);
    }
  }
  return Array.from(map.entries())
    .map(([method, v]) => ({
      method,
      orders: v.orders,
      total: roundReportMoney(v.total),
      totalAfterDiscount: roundReportMoney(v.totalAfterDiscount),
    }))
    .sort((a, b) => b.totalAfterDiscount - a.totalAfterDiscount);
}

/** Prefer GET /api/analytics/payment-breakdown. Drop a generic Card row when Visa/Amex/… are already listed. */
export function paymentRowsFromApi(
  rows: { name: string; value: number; method?: string | null; cardName?: string | null }[],
  details: AnalyticsTransactionDetail[],
): PaymentBreakdownRow[] {
  const brands = rows.some((row) => (row.method ?? '').toLowerCase() === 'card' && row.cardName);
  const counts = new Map(paymentMethodBreakdown(details).map((row) => [row.method, row.orders]));
  return rows
    .filter((row) => {
      const genericCard = (row.method ?? '').toLowerCase() === 'card'
        && !row.cardName
        && /^card$/i.test(row.name);
      return !(brands && genericCard);
    })
    .map((row) => ({
      method: row.name,
      orders: counts.get(row.name) ?? 0,
      total: roundReportMoney(Number(row.value) || 0),
      totalAfterDiscount: roundReportMoney(Number(row.value) || 0),
    }));
}

export interface ReportDiscountPart {
  type: string;
  amount: number;
}

export function discountParts(detail: {
  discount?: number | null;
  discountTotal?: number | null;
  discountFood?: number | null;
  discountDrink?: number | null;
  discountItems?: number | null;
  discountTotalPercent?: number | null;
  discountFoodPercent?: number | null;
  discountDrinkPercent?: number | null;
  discountTotalPercentAmount?: number | null;
  discountFoodPercentAmount?: number | null;
  discountDrinkPercentAmount?: number | null;
}): ReportDiscountPart[] {
  const parts: ReportDiscountPart[] = [];
  const push = (type: string, amount?: number | null) => {
    const n = Number(amount ?? 0);
    if (n > 0) parts.push({ type, amount: n });
  };
  push('Total', detail.discountTotal);
  if (Number(detail.discountTotalPercent ?? 0) > 0) {
    push(`Total ${Number(detail.discountTotalPercent)}%`, detail.discountTotalPercentAmount);
  }
  push('Food', detail.discountFood);
  if (Number(detail.discountFoodPercent ?? 0) > 0) {
    push(`Food ${Number(detail.discountFoodPercent)}%`, detail.discountFoodPercentAmount);
  }
  push('Drink', detail.discountDrink);
  if (Number(detail.discountDrinkPercent ?? 0) > 0) {
    push(`Drink ${Number(detail.discountDrinkPercent)}%`, detail.discountDrinkPercentAmount);
  }
  push('Disc. Items', detail.discountItems);
  if (parts.length === 0 && Number(detail.discount ?? 0) > 0) {
    parts.push({ type: 'Discount', amount: Number(detail.discount) });
  }
  return parts;
}

function roundReportMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dollar amount taken off the check. A percent left at 0 is not counted. */
export function discountAmount(detail: Parameters<typeof discountParts>[0]): number {
  return roundReportMoney(discountParts(detail).reduce((sum, part) => sum + part.amount, 0));
}

/** Discount kinds across the report, including Disc. Items. Empty kinds are omitted. */
export function discountBreakdown(details: Parameters<typeof discountParts>[0][]): ReportDiscountPart[] {
  const totals = new Map<string, number>();
  for (const detail of uniqueChecks(details)) {
    for (const part of discountParts(detail)) {
      totals.set(part.type, roundReportMoney((totals.get(part.type) ?? 0) + part.amount));
    }
  }
  return Array.from(totals.entries()).map(([type, amount]) => ({ type, amount }));
}

/**
 * Amount collected after the discount.
 * The order total is often still the pre-discount bill; the payment amount is what was charged.
 */
export function chargedTotal(detail: AnalyticsTransactionDetail): number {
  const gross = roundReportMoney(Number(detail.total ?? detail.amount ?? 0));
  const discount = discountAmount(detail);
  const payments = detail.payments ?? [];
  const paid = payments.length > 0
    ? roundReportMoney(payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0))
    : 0;

  if (discount <= 0) {
    return paid > 0 && gross <= 0 ? paid : gross;
  }
  const net = roundReportMoney(Math.max(0, gross - discount));
  if (paid > 0 && Math.abs(paid - net) <= 0.05) return paid;
  if (paid > 0 && Math.abs(paid - gross) <= 0.05) return gross;
  if (paid > 0 && paid < gross) return paid;
  return net;
}

/** Bill before the discount. When no discount was used, this matches the amount collected. */
export function grossBillTotal(detail: AnalyticsTransactionDetail): number {
  const built = roundReportMoney(
    Number(detail.subtotal ?? 0) + Number(detail.serviceCharge ?? 0) + Number(detail.vat ?? 0),
  );
  const stored = roundReportMoney(Number(detail.total ?? detail.amount ?? 0));
  const face = built > stored + 0.05 ? built : stored;
  const discount = discountAmount(detail);
  const charged = chargedTotal(detail);
  if (discount <= 0) return Math.max(face, charged);
  const rebuilt = roundReportMoney(charged + discount);
  return face + 0.05 >= rebuilt ? face : rebuilt;
}

export interface ReportGridRow {
  key: string;
  orderLabel: string;
  tableLabel: string;
  zoneLabel: string;
  orderTypeName: string;
  guests: number;
  itemName: string;
  qty: number;
  unitPrice: number;
  itemTotal: number;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  /** Bill before discount. */
  orderTotal: number;
  /** Amount collected after the discount. */
  totalAfterDiscount: number;
  tip: number;
  discountParts: ReportDiscountPart[];
  payment: string;
  cardName: string;
  cardNumber: string;
  status: string;
  openedAt: string;
  closedAt: string;
  paymentId: string;
  /** Sequential order id used by reopen and payment correction. */
  orderId: string;
  isOrderSummaryOnly?: boolean;
}

function orderItems(detail: AnalyticsTransactionDetail): OrderItem[] {
  if (detail.items?.length) return detail.items;
  return [];
}

/** Same menu line (id or name+size+price) → one report row with summed qty. */
function mergeLineItemsForReport(items: OrderItem[]): {
  key: string;
  itemName: string;
  qty: number;
  unitPrice: number;
  itemTotal: number;
}[] {
  const map = new Map<
    string,
    { key: string; itemName: string; qty: number; unitPrice: number; itemTotal: number }
  >();

  for (const item of items) {
    if (item.status === 'Voided') continue;
    const raw = item as unknown as Record<string, unknown>;
    const menuItemId = String(item.menuItemId ?? raw.menuItemId ?? raw.menu_item_id ?? '').trim();
    const name = String(item.name ?? '').trim();
    const size = String(item.size ?? '').trim();
    const unitPrice = Number(item.unitPrice ?? 0);
    const displayName = size ? `${name} (${size})` : name;
    const mergeKey = menuItemId
      ? `mid:${menuItemId}|${unitPrice.toFixed(2)}`
      : `lbl:${displayName.toLowerCase()}|${unitPrice.toFixed(2)}`;
    const qty = item.qty ?? 1;
    const addTotal = lineTotal(qty, unitPrice);
    const prev = map.get(mergeKey);
    if (prev) {
      prev.qty += qty;
      prev.itemTotal += addTotal;
    } else {
      map.set(mergeKey, {
        key: mergeKey,
        itemName: displayName,
        qty,
        unitPrice,
        itemTotal: addTotal,
      });
    }
  }

  return Array.from(map.values());
}

function compareOrderId(a: string, b: string): number {
  const left = a.trim();
  const right = b.trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/** One check per order. Cash + card on the same order must not become two order ids. */
export function checkKey(detail: {
  orderId?: string | null;
  paymentId?: string | null;
  tenderGroupId?: string | null;
  payments?: { tenderGroupId?: string | null }[] | null;
}): string {
  const orderId = (detail.orderId ?? '').trim();
  if (orderId) return `order:${orderId}`;
  const tender = (
    detail.tenderGroupId
    ?? detail.payments?.find((p) => p.tenderGroupId)?.tenderGroupId
    ?? ''
  ).trim();
  if (tender) return `tender:${tender}`;
  return `pay:${detail.paymentId ?? ''}`;
}

function mergePaymentLists(
  primary: AnalyticsTransactionDetail['payments'],
  extra: AnalyticsTransactionDetail['payments'],
): AnalyticsTransactionDetail['payments'] {
  const merged = [...(primary ?? [])];
  const seen = new Set(merged.map((p) => p.paymentId).filter(Boolean));
  for (const payment of extra ?? []) {
    if (payment.paymentId && seen.has(payment.paymentId)) continue;
    if (payment.paymentId) seen.add(payment.paymentId);
    merged.push(payment);
  }
  return merged.length > 0 ? merged : undefined;
}

export function uniqueChecks(details: AnalyticsTransactionDetail[]): AnalyticsTransactionDetail[] {
  const map = new Map<string, AnalyticsTransactionDetail>();
  for (const detail of details) {
    const key = checkKey(detail);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, detail);
      continue;
    }
    const prevScore = (prev.items?.length ?? 0) + (Number(prev.subtotal ?? 0) > 0 ? 10 : 0);
    const nextScore = (detail.items?.length ?? 0) + (Number(detail.subtotal ?? 0) > 0 ? 10 : 0);
    const keep = nextScore > prevScore ? detail : prev;
    const other = keep === detail ? prev : detail;
    map.set(key, {
      ...keep,
      payments: mergePaymentLists(keep.payments, other.payments),
    });
  }
  return Array.from(map.values());
}

export function tenderDisplayName(method?: string | null, cardName?: string | null): string {
  const raw = (method ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('visa')) return 'Visa';
  if (lower.includes('amex') || lower.includes('american')) return 'Amex';
  if (lower.includes('master')) return 'Master';
  if (lower.includes('union')) return 'Union';
  if (lower.includes('card')) {
    const brand = cardName?.trim();
    return brand || 'Card';
  }
  if (lower.includes('cash')) return 'Cash';
  if (lower.includes('qr')) return 'QR';
  if (lower.includes('room')) return 'Room';
  return raw || '—';
}

export function checkPaymentLabel(detail: AnalyticsTransactionDetail): string {
  const payments = detail.payments ?? [];
  if (payments.length > 1) {
    return payments
      .map((payment) => `${tenderDisplayName(payment.method, payment.cardName)} ${formatReportMoney(Number(payment.amount ?? 0))}`)
      .join(', ');
  }
  return tenderDisplayName(detail.method, detail.cardName);
}

export function buildReportGridRows(details: AnalyticsTransactionDetail[]): ReportGridRow[] {
  const ordered = uniqueChecks(details).sort((a, b) => compareOrderId(a.orderId ?? '', b.orderId ?? ''));
  const rows: ReportGridRow[] = [];
  for (const d of ordered) {
    const items = orderItems(d);
    const subtotal = Number(d.subtotal ?? 0);
    const serviceCharge = Number(d.serviceCharge ?? 0);
    const vat = Number(d.vat ?? 0);
    const orderTotal = grossBillTotal(d);
    const totalAfterDiscount = chargedTotal(d);
    const guests = Number(d.guestCount ?? d.covers ?? 1) || 1;
    const raw = d as unknown as Record<string, unknown>;
    const zoneLabel = String(
      d.zoneLabel ?? raw.zone_label ?? raw.zone ?? '',
    ).trim() || '—';
    const orderTypeName = String(
      d.orderTypeName ?? raw.order_type_name ?? '',
    ).trim() || '—';
    const base = {
      orderLabel: shortOrderLabel(d),
      tableLabel: d.tableLabel || 'N/A',
      zoneLabel,
      orderTypeName,
      guests,
      subtotal: subtotal || orderTotal,
      serviceCharge,
      vat,
      orderTotal,
      totalAfterDiscount,
      tip: Number(d.tip ?? 0) || 0,
      discountParts: discountParts(d),
      payment: checkPaymentLabel(d),
      cardName: (d.payments ?? []).map((p) => p.cardName?.trim()).filter(Boolean).join(', ')
        || d.cardName?.trim()
        || '',
      cardNumber: (d.payments ?? []).map((p) => p.cardNumber?.trim()).filter(Boolean).join(', ')
        || d.cardNumber?.trim()
        || '',
      status: 'DONE',
      openedAt: fmtReportDateTime(d.openedAt),
      closedAt: fmtReportDateTime(d.closedAt ?? d.time),
      paymentId: d.paymentId,
      orderId: d.orderId ?? '',
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

    const mergedLines = mergeLineItemsForReport(items);
    if (mergedLines.length === 0) {
      rows.push({
        key: `${d.paymentId}-summary`,
        ...base,
        itemName: items.some((i) => i.status === 'Voided')
          ? '(All items voided)'
          : '(No billable line items)',
        qty: 0,
        unitPrice: 0,
        itemTotal: 0,
        isOrderSummaryOnly: true,
      });
      continue;
    }
    mergedLines.forEach((line, idx) => {
      const isLast = idx === mergedLines.length - 1;
      rows.push({
        key: `${d.paymentId}-${line.key}`,
        ...base,
        itemName: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        itemTotal: line.itemTotal,
        subtotal: isLast ? base.subtotal : 0,
        serviceCharge: isLast ? base.serviceCharge : 0,
        vat: isLast ? base.vat : 0,
        orderTotal: isLast ? base.orderTotal : 0,
        totalAfterDiscount: isLast ? base.totalAfterDiscount : 0,
        tip: isLast ? base.tip : 0,
        discountParts: isLast ? base.discountParts : [],
        payment: isLast ? base.payment : '',
        cardName: isLast ? base.cardName : '',
        cardNumber: isLast ? base.cardNumber : '',
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
      if (r.totalAfterDiscount > 0 || r.isOrderSummaryOnly) acc.totalAfterDiscount += r.totalAfterDiscount;
      acc.tip += r.tip;
      acc.discount += r.discountParts.reduce((s, p) => s + p.amount, 0);
      return acc;
    },
    { subtotal: 0, serviceCharge: 0, vat: 0, orderTotal: 0, totalAfterDiscount: 0, tip: 0, discount: 0 },
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
  menuLookup?: MenuCategoryLookup,
  paymentBreakdown?: { name: string; value: number; method?: string | null; cardName?: string | null }[],
): string {
  const lines: string[] = [];
  const checks = uniqueChecks(orderDetails);
  const financial = aggregateFinancials(checks);
  const discountLines = discountBreakdown(checks);
  const paymentRows = paymentBreakdown?.length
    ? paymentRowsFromApi(paymentBreakdown, checks)
    : paymentMethodBreakdown(checks);
  const gridRows = buildReportGridRows(checks);
  const colTotals = gridColumnTotals(gridRows);
  const totalOrders = checks.length;
  const totalGuests = checks.reduce(
    (s, d) => s + (Number(d.guestCount ?? d.covers ?? 1) || 1),
    0,
  );
  const generatedLabel = generatedAt.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  lines.push(csvRow(['NAKNAK POS Report']));
  lines.push(csvRow([`Date Range: ${dateFrom} to ${dateTo}`]));
  lines.push(csvRow([`Generated on: ${generatedLabel}`]));
  lines.push('');

  lines.push(csvRow(['Summary']));
  lines.push(csvRow(['Total Orders', totalOrders]));
  lines.push(csvRow(['Total Guests', totalGuests]));
  const categorySales = aggregateSalesByCategoryType(orderDetails, menuLookup);
  lines.push(csvRow(['Total Food Sales', moneyCsv(categorySales.food)]));
  lines.push(csvRow(['Total Drink Sales', moneyCsv(categorySales.drink)]));
  lines.push('');

  lines.push(csvRow(['Financial Summary']));
  lines.push(csvRow(['Label', 'Amount']));
  lines.push(csvRow(['Subtotal', moneyCsv(financial.subtotal)]));
  lines.push(csvRow(['Service Charge', moneyCsv(financial.serviceCharge)]));
  lines.push(csvRow(['VAT', moneyCsv(financial.vat)]));
  lines.push(csvRow(['Total', moneyCsv(financial.billTotal)]));
  lines.push(csvRow(['Discount', moneyCsv(financial.discount)]));
  for (const line of discountLines) {
    lines.push(csvRow([line.type, moneyCsv(line.amount)]));
  }
  lines.push(csvRow(['Total after discount', moneyCsv(financial.grandTotal)]));
  lines.push(csvRow(['Tips', moneyCsv(financial.tips)]));
  lines.push('');

  lines.push(csvRow(['Payment Method Breakdown']));
  lines.push(csvRow(['Payment Method', 'Tenders', 'Amount taken']));
  let payOrders = 0;
  let payTotal = 0;
  for (const r of paymentRows) {
    lines.push(csvRow([r.method, r.orders, moneyCsv(r.totalAfterDiscount)]));
    payOrders += r.orders;
    payTotal += r.totalAfterDiscount;
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
      'Zone',
      'Order Type',
      'Guests',
      'Items',
      'Qty',
      'Price',
      'Item Total',
      'Subtotal',
      'Service Charge',
      'VAT',
      'Total',
      'Total after discount',
      'Tip',
      'Discount Type',
      'Discount Amount',
      'Payment',
      'Card Name',
      'Txn',
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
        row.zoneLabel,
        row.orderTypeName,
        row.guests,
        row.itemName,
        row.qty || '',
        row.qty ? moneyCsv(row.unitPrice) : '',
        row.qty ? moneyCsv(row.itemTotal) : '',
        showFin ? moneyCsv(row.subtotal) : '',
        showFin ? moneyCsv(row.serviceCharge) : '',
        showFin ? moneyCsv(row.vat) : '',
        showFin ? moneyCsv(row.orderTotal) : '',
        showFin ? moneyCsv(row.totalAfterDiscount) : '',
        showFin ? moneyCsv(row.tip) : '',
        row.discountParts.map((p) => p.type).join('\n'),
        row.discountParts.map((p) => moneyCsv(p.amount)).join('\n'),
        row.payment,
        row.cardName,
        row.cardNumber,
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
        moneyCsv(colTotals.totalAfterDiscount),
        moneyCsv(colTotals.tip),
        '',
        moneyCsv(colTotals.discount),
        '',
        '',
        '',
        '',
        '',
        '',
      ]),
    );
  }

  return lines.join('\r\n');
}
