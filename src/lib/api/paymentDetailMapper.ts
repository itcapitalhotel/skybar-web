import type {
  AnalyticsTransactionDetail,
  AnalyticsTransactionMergeInfo,
  AnalyticsTransactionSplitPart,
  OrderDetailsPayment,
  OrderItem,
  OrderMergeRecord,
  OrderSplitSession,
  OrderTransferRecord,
} from './types';

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (v == null) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return undefined;
}

function mapItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    return {
      id: String(o.id ?? ''),
      name: String(o.name ?? 'Item'),
      qty: num(o.qty) ?? 1,
      unitPrice: num(o.unitPrice ?? o.unit_price) ?? 0,
      status: (o.status as OrderItem['status']) ?? 'Served',
      notes: str(o.notes),
      size: str(o.size),
    };
  });
}

function mapMerges(raw: unknown): OrderMergeRecord[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((row) => {
    const m = row as Record<string, unknown>;
    return {
      sourceTableId: str(m.sourceTableId ?? m.source_table_id),
      sourceTableLabel: str(m.sourceTableLabel ?? m.source_table_label),
      targetTableId: str(m.targetTableId ?? m.target_table_id),
      targetTableLabel: str(m.targetTableLabel ?? m.target_table_label),
      mergedAt: str(m.mergedAt ?? m.merged_at),
      time: str(m.time ?? m.mergedAt ?? m.merged_at),
      itemsMoved: num(m.itemsMoved ?? m.items_moved ?? m.itemCount ?? m.item_count),
      itemCount: num(m.itemCount ?? m.item_count ?? m.itemsMoved ?? m.items_moved),
      staffId: str(m.staffId ?? m.staff_id ?? m.mergedByStaffId ?? m.merged_by_staff_id),
      staffName: str(m.staffName ?? m.staff_name ?? m.mergedByName ?? m.merged_by_name),
      staffRole: str(m.staffRole ?? m.staff_role),
      mergedByStaffId: str(m.mergedByStaffId ?? m.merged_by_staff_id),
      mergedByName: str(m.mergedByName ?? m.merged_by_name),
    };
  });
}

function mapTransfers(raw: unknown): OrderTransferRecord[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((row) => {
    const t = row as Record<string, unknown>;
    return {
      sourceTableId: str(t.sourceTableId ?? t.source_table_id),
      sourceTableLabel: str(t.sourceTableLabel ?? t.source_table_label),
      targetTableId: str(t.targetTableId ?? t.target_table_id),
      targetTableLabel: str(t.targetTableLabel ?? t.target_table_label),
      transferredAt: str(t.transferredAt ?? t.transferred_at),
      time: str(t.time ?? t.transferredAt ?? t.transferred_at),
      staffId: str(t.staffId ?? t.staff_id),
      staffName: str(t.staffName ?? t.staff_name),
      staffRole: str(t.staffRole ?? t.staff_role),
      guests: num(t.guests),
    };
  });
}

function mapSplitSessions(raw: unknown): OrderSplitSession[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((row) => {
    const s = row as Record<string, unknown>;
    const paymentIdsRaw = s.paymentIds ?? s.payment_ids;
    const paymentIds = Array.isArray(paymentIdsRaw)
      ? paymentIdsRaw.map(id => String(id))
      : undefined;
    return {
      splitCount: num(s.splitCount ?? s.split_count ?? s.count),
      count: num(s.count ?? s.splitCount ?? s.split_count),
      total: num(s.total),
      paymentIds,
      splitAt: str(s.splitAt ?? s.split_at),
      time: str(s.time ?? s.splitAt ?? s.split_at ?? s.closedAt ?? s.closed_at),
      closedAt: str(s.closedAt ?? s.closed_at),
    };
  });
}

function legacyMergeToRecords(merge: AnalyticsTransactionMergeInfo | null | undefined): OrderMergeRecord[] | undefined {
  if (!merge) return undefined;
  return [{
    sourceTableId: merge.sourceTableId,
    sourceTableLabel: merge.sourceTableLabel,
    targetTableId: merge.targetTableId,
    targetTableLabel: merge.targetTableLabel,
    mergedAt: merge.mergedAt,
    time: merge.mergedAt,
    mergedByStaffId: merge.mergedByStaffId,
    mergedByName: merge.mergedByName,
    staffName: merge.mergedByName,
  }];
}

function mapPayments(raw: unknown): OrderDetailsPayment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((row) => {
    const p = row as Record<string, unknown>;
    const paidAt = str(p.paidAt ?? p.paid_at);
    const closedAt = str(p.closedAt ?? p.closed_at ?? p.timestamp);
    const time = closedAt ?? paidAt ?? str(p.time) ?? str(p.timestamp) ?? '';
    return {
      paymentId: String(p.paymentId ?? p.payment_id ?? p.id ?? ''),
      guestLabel: str(p.guestLabel ?? p.guest_label),
      method: String(p.method ?? ''),
      amount: num(p.amount) ?? 0,
      time,
      paidAt,
      closedAt,
      staffId: str(p.staffId ?? p.staff_id),
      staffName: str(p.staffName ?? p.staff_name),
      staffRole: str(p.staffRole ?? p.staff_role),
    };
  });
}

/** Map analytics transaction detail, order details, or receipt JSON (camelCase + snake_case). */
export function normalizeOrderDetailResponse(raw: Record<string, unknown>): AnalyticsTransactionDetail {
  const payments = mapPayments(raw.payments);
  const primary = payments?.[0];
  const total = num(raw.total ?? raw.amount) ?? primary?.amount ?? 0;
  const paymentId = str(raw.paymentId ?? raw.payment_id ?? raw.id) ?? '';

  return {
    paymentId,
    orderId: str(raw.orderId ?? raw.order_id),
    tableSessionId: str(raw.tableSessionId ?? raw.table_session_id),
    shiftId: str(raw.shiftId ?? raw.shift_id),
    tableId: str(raw.tableId ?? raw.table_id) ?? '',
    tableLabel: str(raw.tableLabel ?? raw.table_label) ?? '',
    zoneId: str(raw.zoneId ?? raw.zone_id),
    zoneLabel: str(raw.zoneLabel ?? raw.zone_label),
    type: str(raw.type),
    method: str(raw.method ?? primary?.method) ?? '',
    amount: total,
    total,
    subtotal: num(raw.subtotal),
    serviceCharge: num(raw.serviceCharge ?? raw.service_charge),
    vat: num(raw.vat),
    discount: num(raw.discount),
    covers: num(raw.covers),
    openedAt: str(raw.openedAt ?? raw.opened_at),
    closedAt: str(
      raw.closedAt
        ?? raw.closed_at
        ?? raw.completedAt
        ?? raw.completed_at
        ?? raw.timestamp,
    ),
    durationMinutes: num(raw.durationMinutes ?? raw.duration_minutes),
    staffId: str(raw.staffId ?? raw.staff_id ?? primary?.staffId),
    staffName: str(raw.staffName ?? raw.staff_name ?? primary?.staffName),
    staffRole: str(raw.staffRole ?? raw.staff_role ?? primary?.staffRole),
    cashierId: str(raw.cashierId ?? raw.cashier_id),
    cashierName: str(raw.cashierName ?? raw.cashier_name),
    roomNumber: str(raw.roomNumber ?? raw.room_number) ?? null,
    cashTendered: num(raw.cashTendered ?? raw.cash_tendered) ?? null,
    changeAmount: num(raw.changeAmount ?? raw.change_amount ?? raw.change),
    legacyPayment: bool(raw.legacyPayment ?? raw.legacy_payment),
    time: str(
      raw.time
        ?? raw.closedAt
        ?? raw.closed_at
        ?? raw.completedAt
        ?? raw.completed_at
        ?? raw.timestamp
        ?? primary?.closedAt
        ?? primary?.time,
    ),
    split: (raw.split as AnalyticsTransactionSplitPart[] | null) ?? null,
    merge: (raw.merge as AnalyticsTransactionMergeInfo | null) ?? null,
    merges: mapMerges(raw.merges) ?? legacyMergeToRecords(raw.merge as AnalyticsTransactionMergeInfo | null),
    splits: mapSplitSessions(raw.splits),
    transfers: mapTransfers(raw.transfers),
    hasMerge: bool(raw.hasMerge ?? raw.has_merge),
    hasSplit: bool(raw.hasSplit ?? raw.has_split),
    hasTransfer: bool(raw.hasTransfer ?? raw.has_transfer),
    items: mapItems(raw.items),
    payments,
    receiptUrl: str(raw.receiptUrl ?? raw.receipt_url),
  };
}

/** Combine two detail payloads (analytics + orders/details) without dropping merge/split history. */
export function mergeOrderDetailLayers(
  base: AnalyticsTransactionDetail,
  overlay: AnalyticsTransactionDetail,
  paymentId: string,
): AnalyticsTransactionDetail {
  const merges = (overlay.merges?.length ? overlay.merges : base.merges) ?? [];
  const splits = (overlay.splits?.length ? overlay.splits : base.splits) ?? [];
  const transfers = (overlay.transfers?.length ? overlay.transfers : base.transfers) ?? [];
  const items = overlay.items?.length ? overlay.items : (base.items ?? []);
  const payments = overlay.payments?.length ? overlay.payments : base.payments;

  return {
    ...base,
    ...overlay,
    paymentId,
    items,
    payments,
    merges,
    splits,
    transfers,
    merge: overlay.merge ?? base.merge,
    split: overlay.split ?? base.split,
    hasMerge: overlay.hasMerge ?? base.hasMerge ?? merges.length > 0,
    hasSplit:
      (overlay.hasSplit ?? base.hasSplit ?? splits.length > 0)
      || !!(overlay.split?.length || base.split?.length),
    hasTransfer: overlay.hasTransfer ?? base.hasTransfer ?? transfers.length > 0,
  };
}
