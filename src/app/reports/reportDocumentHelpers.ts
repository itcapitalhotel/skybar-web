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

  for (const d of details) {
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
  let grandTotal = 0;
  for (const d of details) {
    const raw = d as unknown as Record<string, unknown>;
    subtotal += Number(d.subtotal ?? raw.subtotal ?? 0);
    serviceCharge += Number(d.serviceCharge ?? raw.service_charge ?? 0);
    vat += Number(d.vat ?? 0);
    tips += Number(d.tip ?? raw.tips ?? raw.tip ?? 0);
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

export interface ReportDiscountPart {
  type: string;
  amount: number;
}

export function discountParts(detail: {
  discount?: number | null;
  discountTotal?: number | null;
  discountFood?: number | null;
  discountDrink?: number | null;
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
  if (Number(detail.discountTotalPercent ?? 0) > 0 || Number(detail.discountTotalPercentAmount ?? 0) > 0) {
    push(`Total ${Number(detail.discountTotalPercent ?? 0)}%`, detail.discountTotalPercentAmount);
  }
  push('Food', detail.discountFood);
  if (Number(detail.discountFoodPercent ?? 0) > 0 || Number(detail.discountFoodPercentAmount ?? 0) > 0) {
    push(`Food ${Number(detail.discountFoodPercent ?? 0)}%`, detail.discountFoodPercentAmount);
  }
  push('Drink', detail.discountDrink);
  if (Number(detail.discountDrinkPercent ?? 0) > 0 || Number(detail.discountDrinkPercentAmount ?? 0) > 0) {
    push(`Drink ${Number(detail.discountDrinkPercent ?? 0)}%`, detail.discountDrinkPercentAmount);
  }
  if (parts.length === 0 && Number(detail.discount ?? 0) > 0) {
    parts.push({ type: 'Discount', amount: Number(detail.discount) });
  }
  return parts;
}

export interface ReportGridRow {
  key: string;
  orderLabel: string;
  tableLabel: string;
  zoneLabel: string;
  guests: number;
  itemName: string;
  qty: number;
  unitPrice: number;
  itemTotal: number;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  orderTotal: number;
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

export function buildReportGridRows(details: AnalyticsTransactionDetail[]): ReportGridRow[] {
  const rows: ReportGridRow[] = [];
  for (const d of details) {
    const items = orderItems(d);
    const subtotal = Number(d.subtotal ?? 0);
    const serviceCharge = Number(d.serviceCharge ?? 0);
    const vat = Number(d.vat ?? 0);
    const orderTotal = Number(d.total ?? d.amount ?? 0);
    const guests = Number(d.guestCount ?? d.covers ?? 1) || 1;
    const raw = d as unknown as Record<string, unknown>;
    const zoneLabel = String(
      d.zoneLabel ?? raw.zone_label ?? raw.zone ?? '',
    ).trim() || '—';
    const base = {
      orderLabel: shortOrderLabel(d),
      tableLabel: d.tableLabel || 'N/A',
      zoneLabel,
      guests,
      subtotal: subtotal || orderTotal,
      serviceCharge,
      vat,
      orderTotal,
      tip: Number(d.tip ?? 0) || 0,
      discountParts: discountParts(d),
      payment: paymentMethodDisplay(d.method),
      cardName: d.cardName?.trim() ?? '',
      cardNumber: d.cardNumber?.trim() ?? '',
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
      acc.tip += r.tip;
      acc.discount += r.discountParts.reduce((s, p) => s + p.amount, 0);
      return acc;
    },
    { subtotal: 0, serviceCharge: 0, vat: 0, orderTotal: 0, tip: 0, discount: 0 },
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
      'Zone',
      'Guests',
      'Items',
      'Qty',
      'Price',
      'Item Total',
      'Subtotal',
      'Service Charge',
      'VAT',
      'Total',
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
        row.guests,
        row.itemName,
        row.qty || '',
        row.qty ? moneyCsv(row.unitPrice) : '',
        row.qty ? moneyCsv(row.itemTotal) : '',
        showFin ? moneyCsv(row.subtotal) : '',
        showFin ? moneyCsv(row.serviceCharge) : '',
        showFin ? moneyCsv(row.vat) : '',
        showFin ? moneyCsv(row.orderTotal) : '',
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
