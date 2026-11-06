'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Users, SplitSquareHorizontal, Check, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ordersApi, paymentsApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';
import type { PaymentMethod, SplitPaymentLine } from '@/lib/api/types';
import {
  explodeItemsToUnits,
  isValidItemPartition,
  partitionItemsByAmounts,
  partitionItemsEvenly,
  type ExplodedSplitUnit,
} from '@/lib/splitBillHelpers';

interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuItemId?: string;
  size?: string;
  notes?: string;
}

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: OrderItem[];
  total: number;
  /** Table pk for API (e.g. table-v3) */
  tableId: string;
  /** Display label (e.g. V3) */
  tableLabel?: string;
  guestCount?: number;
  onSplitComplete?: () => void;
}

type SplitMode = 'equal' | 'byitem' | 'amount';

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'card', label: 'Card' },
  { id: 'cash', label: 'Cash' },
  { id: 'qr', label: 'QR' },
  { id: 'room', label: 'Room' },
];

const CARD_BRANDS = ['Visa', 'Amex', 'Master', 'Union'] as const;
type CardBrand = (typeof CARD_BRANDS)[number];

const MIN_WAYS = 2;
const MAX_WAYS = 20;

function clampWays(n: number): number {
  if (!Number.isFinite(n)) return MIN_WAYS;
  return Math.min(MAX_WAYS, Math.max(MIN_WAYS, Math.round(n)));
}

function equalShares(total: number, count: number): number[] {
  const base = Math.floor((total / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const sum = amounts.reduce((a, v) => a + v, 0);
  const remainder = Math.round((total - sum) * 100) / 100;
  if (amounts.length > 0) amounts[amounts.length - 1] += remainder;
  return amounts;
}

function GuestCardFields({
  cardName,
  cardNumber,
  onCardNameChange,
  onCardNumberChange,
}: {
  cardName: CardBrand;
  cardNumber: string;
  onCardNameChange: (brand: CardBrand) => void;
  onCardNumberChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 pl-0 sm:pl-[3.75rem]">
      <div className="grid grid-cols-4 gap-1.5">
        {CARD_BRANDS.map(brand => (
          <button
            key={brand}
            type="button"
            onClick={() => onCardNameChange(brand)}
            className={`py-2 rounded-lg border text-[10px] font-semibold transition-all ${
              cardName === brand
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {brand}
          </button>
        ))}
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={cardNumber}
        onChange={e => onCardNumberChange(e.target.value)}
        placeholder="Transaction / approval number"
        className="w-full h-9 rounded-xl border border-border bg-muted/20 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

function SplitCountField({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const next = clampWays(Number.isNaN(parsed) ? MIN_WAYS : parsed);
    onChange(next);
    setDraft(String(next));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clampWays(value - 1))}
        disabled={value <= MIN_WAYS}
        className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 disabled:opacity-40"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_WAYS}
        max={MAX_WAYS}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit(draft);
        }}
        className="flex-1 h-9 rounded-xl border border-border bg-muted/20 text-center text-sm font-semibold text-foreground text-tabular focus:outline-none focus:border-primary/50"
        aria-label="Number of splits"
      />
      <button
        type="button"
        onClick={() => onChange(clampWays(value + 1))}
        disabled={value >= MAX_WAYS}
        className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 disabled:opacity-40"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function SplitBillModal({
  isOpen,
  onClose,
  items,
  total,
  tableId,
  tableLabel,
  guestCount = 1,
  onSplitComplete,
}: SplitBillModalProps) {
  const [mode, setMode] = useState<SplitMode>('equal');
  const [splitCount, setSplitCount] = useState(2);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [guestAmounts, setGuestAmounts] = useState<number[]>(() => equalShares(total, 2));
  const [guestMethods, setGuestMethods] = useState<PaymentMethod[]>(['card', 'card']);
  const [guestCardNames, setGuestCardNames] = useState<CardBrand[]>(['Visa', 'Visa']);
  const [guestCardNumbers, setGuestCardNumbers] = useState<string[]>(['', '']);
  const [processing, setProcessing] = useState(false);

  const displayTable = tableLabel ?? tableId;
  const perPerson = total / splitCount;

  const splitUnits = useMemo(
    () => explodeItemsToUnits(items.map((it) => ({
      id: it.id,
      qty: it.qty,
      price: it.price,
      name: it.name,
      menuItemId: it.menuItemId,
      size: it.size,
      notes: it.notes,
    }))),
    [items],
  );

  useEffect(() => {
    if (!isOpen) return;
    setMode('equal');
    setSplitCount(2);
    setAssignments({});
    setGuestAmounts(equalShares(total, 2));
    setGuestMethods(['card', 'card']);
    setGuestCardNames(['Visa', 'Visa']);
    setGuestCardNumbers(['', '']);
  }, [isOpen, total]);

  const unitsSignature = useMemo(
    () => splitUnits.map((u) => u.key).join('|'),
    [splitUnits],
  );

  // Clear unit assignments only when the exploded unit set actually changes
  useEffect(() => {
    setAssignments({});
  }, [unitsSignature]);

  useEffect(() => {
    setGuestAmounts(prev => {
      if (mode !== 'amount' && mode !== 'equal') return prev;
      if (prev.length === splitCount) return prev;
      return equalShares(total, splitCount);
    });
    setGuestMethods(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? 'card');
    });
    setGuestCardNames(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? 'Visa');
    });
    setGuestCardNumbers(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? '');
    });
  }, [splitCount, total, mode]);

  const amountSum = useMemo(
    () => guestAmounts.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0),
    [guestAmounts],
  );
  const amountDelta = Math.round((total - amountSum) * 100) / 100;

  const assignUnit = (unitKey: string, person: number) => {
    setAssignments((prev) => ({ ...prev, [unitKey]: person }));
  };

  /**
   * When units of the same order line go to different guests, break that line
   * into separate qty lines on the order so each guest gets real itemIds.
   */
  const materializeByItemAssignments = async (
    units: ExplodedSplitUnit[],
    staffId: string,
  ): Promise<Map<number, string[]>> => {
    const bySource = new Map<string, ExplodedSplitUnit[]>();
    for (const unit of units) {
      const list = bySource.get(unit.sourceId) ?? [];
      list.push(unit);
      bySource.set(unit.sourceId, list);
    }

    const guestItemIds = new Map<number, string[]>();
    const pushId = (guest: number, id: string) => {
      const list = guestItemIds.get(guest) ?? [];
      list.push(id);
      guestItemIds.set(guest, list);
    };

    for (const [sourceId, sourceUnits] of bySource) {
      const item = items.find((it) => it.id === sourceId);
      if (!item) continue;

      const byGuest = new Map<number, ExplodedSplitUnit[]>();
      for (const unit of sourceUnits) {
        const guest = assignments[unit.key];
        if (!guest) continue;
        const list = byGuest.get(guest) ?? [];
        list.push(unit);
        byGuest.set(guest, list);
      }

      const guestEntries = [...byGuest.entries()].sort(
        (a, b) =>
          Math.min(...a[1].map((u) => u.unitIndex)) -
          Math.min(...b[1].map((u) => u.unitIndex)),
      );
      if (guestEntries.length === 0) continue;

      // Entire line stays with one guest — keep original order line id
      if (guestEntries.length === 1) {
        pushId(guestEntries[0][0], sourceId);
        continue;
      }

      if (!item.menuItemId) {
        throw new Error(
          `Cannot split "${item.name}" into single units — missing menu item id. Re-add the item and try again.`,
        );
      }

      const [firstGuest, firstUnits] = guestEntries[0];
      await ordersApi.updateItem(tableId, sourceId, {
        qty: firstUnits.length,
        notes: item.notes,
      });
      pushId(firstGuest, sourceId);

      for (let i = 1; i < guestEntries.length; i += 1) {
        const [guest, guestUnits] = guestEntries[i];
        const added = await ordersApi.addItems(tableId, {
          staff: staffId,
          items: [
            {
              menuItemId: item.menuItemId,
              name: item.name,
              qty: guestUnits.length,
              unitPrice: item.price,
              size: item.size,
              notes: item.notes,
            },
          ],
        });
        const newIds = (added.addedItems ?? []).map((row) => row.id).filter(Boolean);
        if (newIds.length === 0) {
          throw new Error(`Failed to create split line for ${item.name}`);
        }
        for (const id of newIds) pushId(guest, id);
      }
    }

    return guestItemIds;
  };

  const setGuestAmount = (index: number, raw: string) => {
    const n = parseFloat(raw);
    setGuestAmounts(prev => {
      const next = [...prev];
      next[index] = Number.isFinite(n) ? n : 0;
      return next;
    });
  };

  const setGuestMethod = (index: number, method: PaymentMethod) => {
    setGuestMethods(prev => {
      const next = [...prev];
      next[index] = method;
      return next;
    });
  };

  const setGuestCardName = (index: number, brand: CardBrand) => {
    setGuestCardNames(prev => {
      const next = [...prev];
      next[index] = brand;
      return next;
    });
  };

  const setGuestCardNumber = (index: number, value: string) => {
    setGuestCardNumbers(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const withCardFields = (line: SplitPaymentLine, guestIndex: number): SplitPaymentLine => {
    if (line.method !== 'card') return line;
    return {
      ...line,
      cardName: guestCardNames[guestIndex] ?? 'Visa',
      cardNumber: (guestCardNumbers[guestIndex] ?? '').trim() || null,
    };
  };

  const handleConfirm = async () => {
    const lineItems = items.map(it => ({ id: it.id, qty: it.qty, price: it.price }));
    const allIds = lineItems.map(it => it.id);

    if (items.length === 0) {
      toast.error('No items to split');
      return;
    }

    if (mode === 'byitem') {
      const unassigned = splitUnits.filter((unit) => !assignments[unit.key]);
      if (unassigned.length > 0) {
        toast.error('Assign every item unit to a guest');
        return;
      }
    }

    if ((mode === 'equal' || mode === 'amount') && splitCount > items.length) {
      toast.error(`Use at most ${items.length} ways (${items.length} line items on the check)`);
      return;
    }

    if (mode === 'amount' && Math.abs(amountDelta) > 0.02) {
      toast.error(`Split amounts must equal $${total.toFixed(2)} (currently $${amountSum.toFixed(2)})`);
      return;
    }

    setProcessing(true);
    try {
      let splits: SplitPaymentLine[] = [];

      if (mode === 'equal') {
        const shares = equalShares(total, splitCount);
        const itemGroups = partitionItemsEvenly(lineItems, splitCount);
        splits = shares.map((amount, i) => withCardFields({
          guestLabel: `Guest ${i + 1}`,
          itemIds: itemGroups[i] ?? [],
          method: guestMethods[i] ?? 'card',
          amount,
        }, i));
      } else if (mode === 'amount') {
        const active = guestAmounts
          .map((a, i) => ({ amount: Math.round(a * 100) / 100, guestIndex: i }))
          .filter(x => x.amount > 0);
        const itemGroups = partitionItemsByAmounts(lineItems, active.map(x => x.amount));
        splits = active.map((row, idx) => withCardFields({
          guestLabel: `Guest ${row.guestIndex + 1}`,
          itemIds: itemGroups[idx] ?? [],
          method: guestMethods[row.guestIndex] ?? 'card',
          amount: row.amount,
        }, row.guestIndex));
      } else {
        const staffId = getAuthUser()?.id;
        if (!staffId) {
          toast.error('Sign in again to process split payments');
          return;
        }

        // Break multi-qty lines into real order lines when units go to different guests
        const guestItemIds = await materializeByItemAssignments(splitUnits, staffId);
        const guests = Array.from({ length: splitCount }).map((_, i) => {
          const guestNum = i + 1;
          const ids = [...new Set(guestItemIds.get(guestNum) ?? [])];
          const sub = splitUnits
            .filter((unit) => assignments[unit.key] === guestNum)
            .reduce((a, unit) => a + unit.price, 0);
          return { guestNum, ids, sub };
        }).filter((g) => g.ids.length > 0);

        const orderSub = splitUnits.reduce((a, unit) => a + unit.price, 0);
        const shareAmounts = guests.map((g) =>
          orderSub > 0 ? Math.round((g.sub / orderSub) * total * 100) / 100 : 0,
        );
        const shareSum = shareAmounts.reduce((a, v) => a + v, 0);
        const shareRemainder = Math.round((total - shareSum) * 100) / 100;
        if (shareAmounts.length > 0) shareAmounts[shareAmounts.length - 1] += shareRemainder;

        splits = guests.map((g, idx) => withCardFields({
          guestLabel: `Guest ${g.guestNum}`,
          itemIds: g.ids,
          method: guestMethods[g.guestNum - 1] ?? 'card',
          amount: shareAmounts[idx] ?? 0,
        }, g.guestNum - 1)).filter((s) => s.itemIds.length > 0 && s.amount > 0);

        splits = splits.filter((s) => s.itemIds.length > 0 && s.amount > 0);

        if (splits.length === 0) {
          toast.error('No split payments to process');
          return;
        }

        const missingTxn = splits.find((s) => s.method === 'card' && !s.cardNumber?.trim());
        if (missingTxn) {
          toast.error(`Enter transaction number for ${missingTxn.guestLabel}`);
          return;
        }

        const materializedIds = splits.flatMap((s) => s.itemIds);
        if (!isValidItemPartition(materializedIds, splits.map((s) => s.itemIds))) {
          toast.error('Each guest needs at least one item, and every item must be assigned once');
          return;
        }

        await paymentsApi.split({
          tableId,
          guestCount: Math.max(1, guestCount),
          splits,
          staffId,
          cashierId: staffId,
        });
        toast.success(`Bill split into ${splits.length} — receipts ready for printing`);
        onSplitComplete?.();
        onClose();
        return;
      }

      splits = splits.filter(s => s.itemIds.length > 0 && s.amount > 0);

      if (splits.length === 0) {
        toast.error('No split payments to process');
        return;
      }

      const missingTxn = splits.find(s => s.method === 'card' && !s.cardNumber?.trim());
      if (missingTxn) {
        toast.error(`Enter transaction number for ${missingTxn.guestLabel}`);
        return;
      }

      if (!isValidItemPartition(allIds, splits.map(s => s.itemIds))) {
        toast.error('Each guest needs at least one item, and every item must be assigned once');
        return;
      }

      const staffId = getAuthUser()?.id;
      if (!staffId) {
        toast.error('Sign in again to process split payments');
        return;
      }

      await paymentsApi.split({
        tableId,
        guestCount: Math.max(1, guestCount),
        splits,
        staffId,
        cashierId: staffId,
      });
      toast.success(`Bill split into ${splits.length} — receipts ready for printing`);
      onSplitComplete?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Split payment failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-lg slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <SplitSquareHorizontal size={16} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Split Bill</h3>
              <p className="text-xs text-muted-foreground">
                Table {displayTable} · ${total.toFixed(2)} total
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'equal' as const, label: 'Equal', icon: Users },
              { id: 'amount' as const, label: 'By $', icon: SplitSquareHorizontal },
              { id: 'byitem' as const, label: 'By item', icon: SplitSquareHorizontal },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={`split-mode-${id}`}
                type="button"
                onClick={() => setMode(id)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all duration-150 ${
                  mode === id ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-medium mb-2">
              {mode === 'byitem' ? 'Number of guests' : 'Number of ways'}
            </p>
            <SplitCountField value={splitCount} onChange={setSplitCount} />
          </div>

          {mode === 'equal' && (
            <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-2 fade-in">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Per guest (incl. tax &amp; service)</span>
                <span className="text-primary font-bold text-lg text-tabular">${perPerson.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Assign each item to a guest. You can split into up to {items.length} ways on this check.
              </p>
            </div>
          )}

          {mode === 'amount' && (
            <div className="space-y-3 fade-in">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Must total ${total.toFixed(2)}</span>
                <span className={Math.abs(amountDelta) <= 0.02 ? 'text-emerald-400' : 'text-rose-400'}>
                  {amountDelta === 0 ? 'Balanced' : `${amountDelta > 0 ? 'Short' : 'Over'} $${Math.abs(amountDelta).toFixed(2)}`}
                </span>
              </div>
              {guestAmounts.map((amt, i) => (
                <div key={`guest-amt-${i}`} className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-14">Guest {i + 1}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={Number.isFinite(amt) ? amt : ''}
                        onChange={e => setGuestAmount(i, e.target.value)}
                        className="w-full h-9 pl-7 pr-3 rounded-xl border border-border bg-muted/20 text-sm font-semibold text-tabular focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <select
                      value={guestMethods[i] ?? 'card'}
                      onChange={e => setGuestMethod(i, e.target.value as PaymentMethod)}
                      className="h-9 rounded-xl border border-border bg-muted/20 text-xs px-2"
                    >
                      {PAYMENT_METHODS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  {(guestMethods[i] ?? 'card') === 'card' && (
                    <GuestCardFields
                      cardName={guestCardNames[i] ?? 'Visa'}
                      cardNumber={guestCardNumbers[i] ?? ''}
                      onCardNameChange={brand => setGuestCardName(i, brand)}
                      onCardNumberChange={value => setGuestCardNumber(i, value)}
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setGuestAmounts(equalShares(total, splitCount))}
                className="text-xs text-primary hover:underline"
              >
                Reset to equal shares
              </button>
            </div>
          )}

          {mode === 'byitem' && (
            <div className="space-y-2 fade-in">
              <p className="text-[10px] text-muted-foreground">
                Multi-qty lines are broken into 1× units so you can assign each one to a different guest.
              </p>
              {splitUnits.map((unit) => (
                <div key={`assign-${unit.key}`} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm text-foreground font-medium truncate">
                      1× {unit.name}
                      {unit.size ? ` · ${unit.size}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground text-tabular">${unit.price.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end max-w-[50%]">
                    {Array.from({ length: splitCount }).map((_, gi) => (
                      <button
                        key={`assign-${unit.key}-g${gi}`}
                        type="button"
                        onClick={() => assignUnit(unit.key, gi + 1)}
                        className={`min-w-8 h-8 px-1 rounded-lg border text-xs font-semibold transition-all duration-100 ${
                          assignments[unit.key] === gi + 1
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {gi + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(mode === 'equal' || mode === 'byitem') && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Payment method per guest</p>
              {Array.from({ length: splitCount }).map((_, i) => (
                <div key={`guest-method-${i}`} className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-14">Guest {i + 1}</span>
                    <select
                      value={guestMethods[i] ?? 'card'}
                      onChange={e => setGuestMethod(i, e.target.value as PaymentMethod)}
                      className="flex-1 h-9 rounded-xl border border-border bg-muted/20 text-xs px-2"
                    >
                      {PAYMENT_METHODS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  {(guestMethods[i] ?? 'card') === 'card' && (
                    <GuestCardFields
                      cardName={guestCardNames[i] ?? 'Visa'}
                      cardNumber={guestCardNumbers[i] ?? ''}
                      onCardNameChange={brand => setGuestCardName(i, brand)}
                      onCardNumberChange={value => setGuestCardNumber(i, value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing}
            className="w-full btn-primary rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={16} />
            {processing ? 'Processing...' : 'Confirm Split & Print Receipts'}
          </button>
        </div>
      </div>
    </div>
  );
}
