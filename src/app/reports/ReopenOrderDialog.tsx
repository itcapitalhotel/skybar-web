'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { ordersApi } from '@/lib/api/client';
import type { OrderDetailsPayment, OrderDetailsResponse, UpdateClosedOrderRequest } from '@/lib/api/types';

type PayMethod = 'cash' | 'card' | 'qr' | 'room';

interface FormState {
  paymentId: string;
  method: PayMethod;
  cardName: string;
  cardNumber: string;
  cashTendered: string;
  roomNumber: string;
  tip: string;
  guestCount: string;
  note: string;
}

const METHODS: { value: PayMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'qr', label: 'QR' },
  { value: 'room', label: 'Room' },
];

function toMethod(raw?: string | null): PayMethod {
  const m = (raw ?? '').toLowerCase();
  if (m.includes('room')) return 'room';
  if (m.includes('card')) return 'card';
  if (m.includes('qr')) return 'qr';
  return 'cash';
}

function moneyInput(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toFixed(2);
}

function sameMoney(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left === right) return true;
  const na = left === '' ? null : Number(left);
  const nb = right === '' ? null : Number(right);
  if (na == null && nb == null) return true;
  if (na == null || nb == null || Number.isNaN(na) || Number.isNaN(nb)) return false;
  return Math.abs(na - nb) < 0.001;
}

function formFromDetail(detail: OrderDetailsResponse, paymentId: string, note: string): FormState {
  const payments = detail.payments ?? [];
  const payment = payments.find((p) => p.paymentId === paymentId) ?? payments[0];
  return {
    paymentId: payment?.paymentId ?? paymentId,
    method: toMethod(payment?.method ?? detail.method),
    cardName: (payment?.cardName ?? detail.cardName ?? '').trim(),
    cardNumber: (payment?.cardNumber ?? detail.cardNumber ?? '').trim(),
    cashTendered: moneyInput(detail.cashTendered),
    roomNumber: (detail.roomNumber ?? '').trim(),
    tip: moneyInput(payment?.tip ?? detail.tip),
    guestCount: detail.covers != null && detail.covers > 0 ? String(detail.covers) : '',
    note,
  };
}

function buildPatch(
  form: FormState,
  base: FormState,
  split: boolean,
  amount: number,
): UpdateClosedOrderRequest | 'empty' | string {
  const body: UpdateClosedOrderRequest = {};
  if (form.method !== base.method) body.method = form.method;

  if (form.method === 'card') {
    if (form.cardName.trim() !== base.cardName.trim()) body.cardName = form.cardName.trim();
    if (form.cardNumber.trim() !== base.cardNumber.trim()) body.cardNumber = form.cardNumber.trim();
  }

  if (form.method === 'cash') {
    const next = form.cashTendered.trim();
    if (!sameMoney(next, base.cashTendered)) {
      const n = Number(next);
      if (!next || Number.isNaN(n)) return 'Enter the cash received.';
      if (n + 0.001 < amount) return `Cash received must cover $${amount.toFixed(2)}.`;
      body.cashTendered = Math.round(n * 100) / 100;
    } else if (body.method === 'cash') {
      const n = Number(next);
      if (!next || Number.isNaN(n) || n + 0.001 < amount) {
        return `Enter cash received of at least $${amount.toFixed(2)}.`;
      }
      body.cashTendered = Math.round(n * 100) / 100;
    }
  }

  if (form.method === 'room') {
    const room = form.roomNumber.trim();
    if (room !== base.roomNumber.trim()) body.roomNumber = room;
    else if (body.method === 'room' && !room) return 'Enter the room number.';
  }

  if (!sameMoney(form.tip, base.tip)) {
    const raw = form.tip.trim();
    const n = raw === '' ? 0 : Number(raw);
    if (Number.isNaN(n) || n < 0) return 'Tip must be zero or more.';
    body.tip = Math.round(n * 100) / 100;
  }

  if (form.guestCount.trim() !== base.guestCount.trim()) {
    const n = Number(form.guestCount.trim());
    if (!Number.isInteger(n) || n < 1) return 'Guest count must be at least 1.';
    body.guestCount = n;
  }

  const note = form.note.trim();
  if (note && note !== base.note.trim()) body.note = note;

  const changed = Object.keys(body);
  if (changed.length === 0) return 'empty';
  if (split) {
    if (!form.paymentId) return 'Choose which payment to correct.';
    body.paymentId = form.paymentId;
  }
  return body;
}

function paymentLabel(payment: OrderDetailsPayment, index: number): string {
  const guest = payment.guestLabel?.trim();
  const method = payment.method || 'Payment';
  const amount = Number(payment.amount ?? 0).toFixed(2);
  return guest ? `${guest} · ${method} · $${amount}` : `Payment ${index + 1} · ${method} · $${amount}`;
}

export default function ReopenOrderDialog({
  orderId,
  orderLabel,
  tableLabel,
  paymentId,
  onClose,
  onChanged,
}: {
  orderId: string;
  orderLabel: string;
  tableLabel: string;
  paymentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<OrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    ordersApi.getDetails(orderId)
      .then((loaded) => {
        if (cancelled) return;
        const next = formFromDetail(loaded, paymentId, '');
        setDetail(loaded);
        setForm(next);
        setBaseline(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this order.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, paymentId]);

  const payments = detail?.payments ?? [];
  const split = payments.length > 1;
  const selected = useMemo(
    () => payments.find((p) => p.paymentId === form?.paymentId) ?? payments[0],
    [payments, form?.paymentId],
  );
  const amount = Number(selected?.amount ?? detail?.total ?? 0);

  const patchField = (partial: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
    setError('');
  };

  const selectPayment = (nextPaymentId: string) => {
    if (!detail) return;
    const note = form?.note ?? '';
    const guests = form?.guestCount ?? '';
    const next = formFromDetail(detail, nextPaymentId, note);
    next.guestCount = guests || next.guestCount;
    setForm(next);
    setBaseline({ ...next, note: '', guestCount: formFromDetail(detail, nextPaymentId, '').guestCount });
    setError('');
  };

  const savePayment = async () => {
    if (!form || !baseline || saving || reopening) return;
    const patch = buildPatch(form, baseline, split, amount);
    if (patch === 'empty') {
      setError('Change a field before saving. Only the fields you edit are sent.');
      return;
    }
    if (typeof patch === 'string') {
      setError(patch);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await ordersApi.updateClosed(orderId, patch);
      toast.success(`Payment updated on ${tableLabel}. The order stays closed.`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the payment.');
    } finally {
      setSaving(false);
    }
  };

  const reopenOrder = async () => {
    if (reopening || saving) return;
    setReopening(true);
    setError('');
    try {
      await ordersApi.reopen(orderId);
      toast.success(`${tableLabel} is occupied again. Change the items, then pay once.`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen this order.');
      setConfirmReopen(false);
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <RotateCcw size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Update {orderLabel}</h2>
              <p className="text-xs text-muted-foreground truncate">{tableLabel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Loading order…
            </div>
          ) : loadError ? (
            <p className="text-sm text-rose-400">{loadError}</p>
          ) : form ? (
            <>
              <section className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Correct payment</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    The order stays closed. The open shift moves the sale from the old method to the new one.
                  </p>
                </div>

                {split ? (
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Split payment</span>
                    <select
                      className="field-input w-full"
                      value={form.paymentId}
                      onChange={(e) => selectPayment(e.target.value)}
                    >
                      {payments.map((payment, index) => (
                        <option key={payment.paymentId} value={payment.paymentId}>
                          {paymentLabel(payment, index)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Method</span>
                  <select
                    className="field-input w-full"
                    value={form.method}
                    onChange={(e) => patchField({ method: e.target.value as PayMethod })}
                  >
                    {METHODS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </label>

                {form.method === 'card' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs text-muted-foreground">Card name</span>
                      <input
                        className="field-input w-full"
                        value={form.cardName}
                        onChange={(e) => patchField({ cardName: e.target.value })}
                        placeholder="Visa"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted-foreground">Card number</span>
                      <input
                        className="field-input w-full"
                        value={form.cardNumber}
                        onChange={(e) => patchField({ cardNumber: e.target.value })}
                        placeholder="123456"
                      />
                    </label>
                  </div>
                ) : null}

                {form.method === 'cash' ? (
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Cash received</span>
                    <input
                      className="field-input w-full"
                      inputMode="decimal"
                      value={form.cashTendered}
                      onChange={(e) => patchField({ cashTendered: e.target.value })}
                      placeholder={amount.toFixed(2)}
                    />
                  </label>
                ) : null}

                {form.method === 'room' ? (
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Room number</span>
                    <input
                      className="field-input w-full"
                      value={form.roomNumber}
                      onChange={(e) => patchField({ roomNumber: e.target.value })}
                    />
                  </label>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Tip</span>
                    <input
                      className="field-input w-full"
                      inputMode="decimal"
                      value={form.tip}
                      onChange={(e) => patchField({ tip: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Guests</span>
                    <input
                      className="field-input w-full"
                      inputMode="numeric"
                      value={form.guestCount}
                      onChange={(e) => patchField({ guestCount: e.target.value })}
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Note</span>
                  <input
                    className="field-input w-full"
                    value={form.note}
                    onChange={(e) => patchField({ note: e.target.value })}
                    placeholder="Corrected method"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => { void savePayment(); }}
                  disabled={saving || reopening}
                  className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save payment correction'}
                </button>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reopen to change items</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    The order goes back to active, {tableLabel} is occupied again, and the old payment is removed so it is not charged twice.
                    Change the items on the floor, then pay again. This fails if the table already has another open order.
                  </p>
                </div>
                {confirmReopen ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void reopenOrder(); }}
                      disabled={reopening || saving}
                      className="flex-1 h-9 rounded-lg bg-rose-600 text-white text-sm font-medium disabled:opacity-60"
                    >
                      {reopening ? 'Reopening…' : 'Reopen order'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReopen(false)}
                      disabled={reopening}
                      className="h-9 px-3 rounded-lg border border-border text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setConfirmReopen(true); setError(''); }}
                    disabled={reopening || saving}
                    className="w-full h-9 rounded-lg border border-rose-500/40 text-rose-400 text-sm font-medium hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Reopen order
                  </button>
                )}
              </section>
            </>
          ) : null}

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
