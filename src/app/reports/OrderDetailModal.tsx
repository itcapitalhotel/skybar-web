'use client';

import React, { useEffect, useState } from 'react';
import {
  X, Eye, Clock, Users, MapPin, CreditCard, SplitSquareHorizontal, Merge, ArrowLeftRight,
  Loader2, AlertCircle, Receipt, BedDouble, Banknote, Info,
} from 'lucide-react';
import { analyticsApi, ordersApi, paymentsApi } from '@/lib/api/client';
import { mergeOrderDetailLayers, normalizeOrderDetailResponse } from '@/lib/api/paymentDetailMapper';
import type {
  AnalyticsTransactionDetail,
  AnalyticsTransactionSplitPart,
  OrderMergeRecord,
  OrderDetailsPayment,
  OrderSplitSession,
  OrderTransferRecord,
} from '@/lib/api/types';
import { finalizeStaffDisplay, pickStaffFields, resolveStaffDisplay } from '@/lib/staffDisplay';

function fmtWhen(iso?: string): string {
  if (!iso) return '—';
  if (!iso.includes('T') && !iso.includes('-')) return iso;
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function staffLabel(raw: {
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  name?: string;
}): string {
  const fields = pickStaffFields(raw as Record<string, unknown>);
  const name = finalizeStaffDisplay({
    staffId: fields.staffId || raw.staffId,
    staffName: fields.staffName || raw.staffName || raw.name,
  }, fields.staffId || raw.staffId);
  if (raw.staffRole && name !== 'Unassigned') return `${name} · ${raw.staffRole}`;
  return name;
}

function paymentMethodLabel(txn: AnalyticsTransactionDetail): string {
  const m = (txn.method || '').toLowerCase();
  if ((m.includes('room') || m === 'room') && txn.roomNumber) {
    return `Room ${txn.roomNumber}`;
  }
  return txn.method || '—';
}

/** Row data from Reports list — used if detail APIs fail */
export interface OrderListSnapshot {
  amount: number;
  method: string;
  time: string;
  staff: string;
  tableLabel: string;
}

interface OrderDetailModalProps {
  paymentId: string;
  orderIdHint?: string;
  tableLabel?: string;
  listSnapshot?: OrderListSnapshot;
  onClose: () => void;
}

export default function OrderDetailModal({
  paymentId,
  orderIdHint,
  tableLabel,
  listSnapshot,
  onClose,
}: OrderDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txn, setTxn] = useState<AnalyticsTransactionDetail | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setLoadNote(null);
      setTxn(null);

      const tried: string[] = [];
      let analyticsError: string | null = null;

      try {
        tried.push(`GET /api/analytics/transactions/${paymentId}`);
        const detail = await analyticsApi.getTransaction(paymentId);
        if (cancelled) return;
        setTxn(detail);
        if (detail.legacyPayment) {
          setLoadNote(
            'Legacy payment — the order was removed at checkout, so line items are not stored. Totals, zone, room, and staff come from the payment record.',
          );
        }
        const oid = detail.orderId ?? orderIdHint;
        if (oid && !detail.legacyPayment) {
          try {
            const od = await ordersApi.getDetails(oid);
            if (!cancelled) {
              const overlay = normalizeOrderDetailResponse(od as unknown as Record<string, unknown>);
              setTxn(mergeOrderDetailLayers(detail, overlay, paymentId));
            }
          } catch {
            /* analytics payload is enough */
          }
        }
        return;
      } catch (err) {
        if (cancelled) return;
        analyticsError = err instanceof Error ? err.message : 'Failed to load payment detail';
      }

      if (orderIdHint) {
        try {
          tried.push(`GET /api/orders/details/${orderIdHint}`);
          const od = await ordersApi.getDetails(orderIdHint);
          if (cancelled) return;
          setTxn(normalizeOrderDetailResponse({ ...od, paymentId } as unknown as Record<string, unknown>));
          // od from getDetails is already normalized shape via client wrapper
          setLoadNote(analyticsError ? `Loaded via /orders/details (${analyticsError})` : null);
          return;
        } catch {
          /* receipt next */
        }
      }

      try {
        tried.push(`GET /api/receipts/${paymentId}`);
        const receipt = await paymentsApi.getReceipt(paymentId);
        if (cancelled) return;
        setTxn(normalizeOrderDetailResponse({
          ...(receipt as unknown as Record<string, unknown>),
          paymentId,
          changeAmount: receipt.change ?? receipt.changeAmount,
        }));
        setLoadNote(analyticsError ? `Loaded from receipt (${analyticsError})` : 'Loaded from receipt.');
        return;
      } catch {
        /* list snapshot */
      }

      if (listSnapshot) {
        if (cancelled) return;
        setTxn({
          paymentId,
          tableId: '',
          tableLabel: listSnapshot.tableLabel || tableLabel || '—',
          method: listSnapshot.method,
          amount: listSnapshot.amount,
          total: listSnapshot.amount,
          time: listSnapshot.time,
          staffName: listSnapshot.staff,
        });
        setLoadNote(analyticsError ?? 'Showing Reports list summary only.');
        return;
      }

      if (!cancelled) {
        setError(analyticsError ?? 'Payment detail could not be loaded.');
        setLoadNote(tried.join('\n'));
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [paymentId, orderIdHint, tableLabel, listSnapshot]);

  const items = txn?.items ?? [];
  const displayTotal = txn?.total ?? txn?.amount ?? 0;
  const legacySplitParts = txn?.split;
  const mergeRecords = txn?.merges ?? [];
  const splitSessions = txn?.splits ?? [];
  const transferRecords = txn?.transfers ?? [];
  const showMergeHistory = txn?.hasMerge || mergeRecords.length > 0;
  const showSplitHistory =
    txn?.hasSplit || splitSessions.length > 0 || !!(legacySplitParts && legacySplitParts.length > 0);
  const showTransferHistory = txn?.hasTransfer || transferRecords.length > 0;
  const payments = txn?.payments ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <Eye size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Order / Payment Detail</h2>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {txn?.tableLabel ?? tableLabel ?? '—'} · {paymentId.slice(0, 8)}…
              </p>
              {(showMergeHistory || showSplitHistory || showTransferHistory) && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {showTransferHistory && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25">
                      Table change
                    </span>
                  )}
                  {showMergeHistory && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">
                      Merge
                    </span>
                  )}
                  {showSplitHistory && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                      Split bill
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 size={22} className="animate-spin text-primary" />
              Loading detail…
            </div>
          )}

          {txn?.legacyPayment && !loading && (
            <p className="text-[10px] text-sky-400/95 bg-sky-500/10 border border-sky-500/25 rounded-lg px-3 py-2 flex gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Legacy payment — line items were not saved at checkout. New payments keep full order history.</span>
            </p>
          )}

          {loadNote && !error && !txn?.legacyPayment && (
            <p className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {loadNote}
            </p>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{error}</p>
                {loadNote && (
                  <p className="text-[10px] opacity-70 whitespace-pre-line">Tried:<br />{loadNote}</p>
                )}
              </div>
            </div>
          )}

          {!loading && !error && txn && (
            <>
              <section className="grid grid-cols-2 gap-2">
                <InfoChip icon={<CreditCard size={12} />} label="Payment" value={`${paymentMethodLabel(txn)} · $${displayTotal.toFixed(2)}`} />
                <InfoChip icon={<Clock size={12} />} label="Closed at" value={fmtWhen(txn.closedAt ?? txn.time)} />
                <InfoChip icon={<Users size={12} />} label="Staff" value={staffLabel(txn)} />
                <InfoChip icon={<MapPin size={12} />} label="Table" value={txn.tableLabel || tableLabel || '—'} />
                {txn.zoneLabel && (
                  <InfoChip icon={<MapPin size={12} />} label="Zone" value={txn.zoneLabel} />
                )}
                {txn.covers != null && (
                  <InfoChip icon={<Users size={12} />} label="Covers" value={String(txn.covers)} />
                )}
                {txn.shiftId && (
                  <InfoChip icon={<Receipt size={12} />} label="Shift" value={txn.shiftId} />
                )}
                {txn.cashTendered != null && txn.cashTendered > 0 && (
                  <InfoChip icon={<Banknote size={12} />} label="Cash tendered" value={`$${txn.cashTendered.toFixed(2)}`} />
                )}
                {txn.changeAmount != null && txn.changeAmount > 0 && (
                  <InfoChip icon={<Banknote size={12} />} label="Change" value={`$${txn.changeAmount.toFixed(2)}`} />
                )}
                {txn.roomNumber && (
                  <InfoChip icon={<BedDouble size={12} />} label="Room" value={txn.roomNumber} />
                )}
              </section>

              {(txn.openedAt || txn.closedAt) && (
                <section className="rounded-xl border border-border bg-muted/10 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Table session</p>
                  <p><span className="text-muted-foreground">Opened:</span> {fmtWhen(txn.openedAt)}</p>
                  <p><span className="text-muted-foreground">Closed:</span> {fmtWhen(txn.closedAt)}</p>
                  {txn.durationMinutes != null && (
                    <p><span className="text-muted-foreground">Duration:</span> {txn.durationMinutes} min</p>
                  )}
                </section>
              )}

              {(txn.subtotal != null || txn.serviceCharge != null || txn.vat != null || displayTotal > 0) && (
                <section className="rounded-xl border border-border bg-muted/10 p-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Totals</p>
                  <Line label="Subtotal" value={txn.subtotal} />
                  <Line label="Service charge" value={txn.serviceCharge} />
                  <Line label="VAT" value={txn.vat} />
                  {(txn.discount ?? 0) > 0 && <Line label="Discount" value={-(txn.discount ?? 0)} />}
                  <Line label="Total" value={displayTotal} bold />
                </section>
              )}

              {payments.length > 0 && !(showSplitHistory && splitSessions.some(s => (s.paymentIds?.length ?? 0) > 0)) && (
                <section className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payments</p>
                  {payments.map((p) => (
                    <div key={p.paymentId} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 py-1 border-b border-border/40 last:border-0">
                      <span className="font-medium text-foreground">{p.method}</span>
                      <span className="text-muted-foreground" title={p.paidAt && p.closedAt && p.paidAt !== p.closedAt ? `Paid ${fmtWhen(p.paidAt)}` : undefined}>
                        {fmtWhen(p.closedAt ?? p.time)}
                      </span>
                      <span className="font-semibold tabular-nums ml-auto">${p.amount.toFixed(2)}</span>
                      {p.staffName && (
                        <span className="w-full text-[10px] text-muted-foreground">
                          {p.staffName}{p.staffRole ? ` · ${p.staffRole}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {showTransferHistory && transferRecords.length === 0 && (
                <p className="text-[10px] text-violet-300/90 italic">Table change on this check; event details may be empty for older orders.</p>
              )}

              {showTransferHistory && transferRecords.length > 0 && (
                <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-violet-300 font-semibold">
                    <ArrowLeftRight size={12} /> Table changes ({transferRecords.length})
                  </p>
                  {transferRecords.map((tr, i) => (
                    <TransferRecordRow key={`xfer-${i}-${tr.time ?? tr.transferredAt ?? i}`} record={tr} />
                  ))}
                </section>
              )}

              {showMergeHistory && mergeRecords.length === 0 && (
                <p className="text-[10px] text-violet-400/90 italic">Merge recorded on this check; line-level history may be empty for older orders.</p>
              )}

              {showMergeHistory && mergeRecords.length > 0 && (
                <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-violet-400 font-semibold">
                    <Merge size={12} /> Table merges ({mergeRecords.length})
                  </p>
                  {mergeRecords.map((m, i) => (
                    <MergeRecordRow key={`merge-${i}-${m.time ?? m.mergedAt ?? i}`} record={m} />
                  ))}
                </section>
              )}

              {showSplitHistory && splitSessions.length === 0 && !(legacySplitParts?.length) && (
                <p className="text-[10px] text-cyan-400/90 italic">Split bill on this check; session details may be empty for older orders.</p>
              )}

              {showSplitHistory && splitSessions.length > 0 && (
                <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <SplitSquareHorizontal size={12} /> Split sessions ({splitSessions.length})
                  </p>
                  {splitSessions.map((s, i) => (
                    <SplitSessionRow
                      key={`split-sess-${i}-${s.time ?? i}`}
                      session={s}
                      currentPaymentId={paymentId}
                      payments={payments}
                      legacyParts={legacySplitParts}
                    />
                  ))}
                </section>
              )}

              {showSplitHistory && splitSessions.length === 0 && legacySplitParts && legacySplitParts.length > 0 && (
                <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <SplitSquareHorizontal size={12} /> Split bill ({legacySplitParts.length} parts)
                  </p>
                  {legacySplitParts.map((s, i) => (
                    <LegacySplitPartRow key={`split-legacy-${i}`} part={s} />
                  ))}
                </section>
              )}

              {items.length > 0 ? (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Line items</p>
                  <div className="rounded-xl border border-border divide-y divide-border/50 overflow-hidden">
                    {items.map((it) => (
                      <div key={it.id} className="flex justify-between gap-2 px-3 py-2">
                        <span className="text-foreground">
                          {it.qty}× {it.name}
                          {it.status && it.status !== 'Served' && (
                            <span className="text-muted-foreground ml-1">({it.status})</span>
                          )}
                        </span>
                        <span className="font-medium tabular-nums">${(it.qty * it.unitPrice).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : !txn.legacyPayment ? (
                <p className="text-[10px] text-muted-foreground italic">No line items on this record.</p>
              ) : null}

              {txn.orderId && (
                <p className="text-[10px] text-muted-foreground font-mono">Order: {txn.orderId}</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function transferTableLine(t: OrderTransferRecord): string {
  const from = t.sourceTableLabel ?? t.sourceTableId ?? '?';
  const to = t.targetTableLabel ?? t.targetTableId ?? '?';
  return `${from} → ${to}`;
}

function TransferRecordRow({ record }: { record: OrderTransferRecord }) {
  const staff = record.staffName;
  return (
    <div className="rounded-lg border border-violet-500/20 bg-background/40 px-3 py-2 space-y-0.5">
      <p className="font-medium text-foreground">{transferTableLine(record)}</p>
      <p className="text-muted-foreground">{fmtWhen(record.time ?? record.transferredAt)}</p>
      {record.guests != null && record.guests > 0 && (
        <p className="text-muted-foreground">{record.guests} guest{record.guests === 1 ? '' : 's'}</p>
      )}
      {staff && (
        <p className="text-muted-foreground">
          By {staff}{record.staffRole ? ` · ${record.staffRole}` : ''}
        </p>
      )}
    </div>
  );
}

function mergeTableLine(m: OrderMergeRecord): string {
  const from = m.sourceTableLabel ?? m.sourceTableId ?? '?';
  const to = m.targetTableLabel ?? m.targetTableId ?? '?';
  return `${from} → ${to}`;
}

function MergeRecordRow({ record }: { record: OrderMergeRecord }) {
  const moved = record.itemsMoved ?? record.itemCount;
  const staff = record.staffName ?? record.mergedByName;
  return (
    <div className="rounded-lg border border-violet-500/20 bg-background/40 px-3 py-2 space-y-0.5">
      <p className="font-medium text-foreground">{mergeTableLine(record)}</p>
      <p className="text-muted-foreground">{fmtWhen(record.time ?? record.mergedAt)}</p>
      {moved != null && moved > 0 && (
        <p className="text-muted-foreground">{moved} item{moved === 1 ? '' : 's'} moved</p>
      )}
      {staff && (
        <p className="text-muted-foreground">
          By {staff}{record.staffRole ? ` · ${record.staffRole}` : ''}
        </p>
      )}
    </div>
  );
}

function formatPayMethod(method?: string): string {
  if (!method) return '—';
  const m = method.trim();
  if (!m) return '—';
  return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
}

function SplitSessionRow({
  session,
  currentPaymentId,
  payments,
  legacyParts,
}: {
  session: OrderSplitSession;
  currentPaymentId: string;
  payments: OrderDetailsPayment[];
  legacyParts?: AnalyticsTransactionSplitPart[] | null;
}) {
  const count = session.splitCount ?? session.count;
  const ids = session.paymentIds ?? [];
  const partCount = ids.length || count || 0;

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-background/40 px-3 py-2 space-y-2">
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
        <span className="font-medium text-foreground">
          {partCount > 0 ? `${partCount} payment${partCount === 1 ? '' : 's'}` : 'Split session'}
        </span>
        {session.total != null && (
          <span className="font-semibold tabular-nums">${session.total.toFixed(2)}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{fmtWhen(session.time ?? session.closedAt ?? session.splitAt)}</p>
      {ids.length > 0 ? (
        <ul className="space-y-1.5 pt-0.5">
          {ids.map((id, idx) => {
            const pay = payments.find(p => p.paymentId === id);
            const legacy = legacyParts?.[idx];
            const guest = pay?.guestLabel ?? legacy?.guestLabel ?? `Guest ${idx + 1}`;
            const method = formatPayMethod(pay?.method ?? legacy?.method);
            const amount = pay?.amount ?? legacy?.amount;
            const isCurrent = id === currentPaymentId;
            return (
              <li
                key={id}
                title={id}
                className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-sm ${
                  isCurrent ? 'bg-cyan-500/10 border border-cyan-500/25' : 'bg-muted/20 border border-transparent'
                }`}
              >
                <span className="font-medium text-foreground min-w-[4.5rem]">{guest}</span>
                <span className="text-muted-foreground">{method}</span>
                {amount != null && (
                  <span className="font-semibold tabular-nums ml-auto">${Number(amount).toFixed(2)}</span>
                )}
                {isCurrent && (
                  <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-cyan-400">
                    This payment
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : legacyParts && legacyParts.length > 0 ? (
        <ul className="space-y-1">
          {legacyParts.map((part, idx) => (
            <li key={`legacy-part-${idx}`} className="flex justify-between gap-2 text-sm">
              <span className="font-medium">{part.guestLabel}</span>
              <span className="text-muted-foreground">{formatPayMethod(part.method)}</span>
              <span className="font-semibold tabular-nums">${Number(part.amount).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LegacySplitPartRow({ part }: { part: AnalyticsTransactionSplitPart }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{part.guestLabel}</span>
      <span className="text-muted-foreground">{part.method}</span>
      <span className="font-semibold">${Number(part.amount).toFixed(2)}</span>
    </div>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">{icon}{label}</p>
      <p className="text-foreground font-medium truncate" title={value}>{value}</p>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value?: number; bold?: boolean }) {
  if (value == null) return null;
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-foreground pt-1 border-t border-border/50' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className="tabular-nums">${Number(value).toFixed(2)}</span>
    </div>
  );
}
