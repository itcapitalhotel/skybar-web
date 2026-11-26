'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Users, SplitSquareHorizontal, Check, Minus, Plus, Printer, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { ordersApi, paymentsApi, receiptsApi, tablesApi, zonesApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';
import type { PaymentMethod, PaymentTender, PrintSplitReceiptLine, SplitPaymentLine, SplitTableShare, TableData, ZoneData } from '@/lib/api/types';
import { findZone } from '@/lib/zoneResolve';
import { formatChangeRiel } from '@/lib/receiptMoney';
import {
  explodeItemsToUnits,
  isValidItemPartition,
  partitionItemsByAmounts,
  partitionItemsEvenly,
  type ExplodedSplitUnit,
} from '@/lib/splitBillHelpers';
import { venueGrossMultiplier } from '@/lib/venueRates';

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
  onSplitComplete?: (tables?: TableData[]) => void;
  /** After unpaid split bill checks print (table → bill) — refresh floor, keep modal open */
  onBillCheckPrinted?: () => void;
  /** Floor tables for “To table” item move */
  tables?: TableData[];
  zones?: ZoneData[];
  /** After selected items move to another table. Receives the destination table id. */
  onItemsMoved?: (targetTableId: string) => void;
}

type SplitMode = 'equal' | 'byitem' | 'amount' | 'totable';

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

/** Guest number (1-based) for each exploded unit. Targets are all-in dollars, or null for an even value split. */
function assignUnitsToGuests(
  units: ExplodedSplitUnit[],
  guestCount: number,
  targets: number[] | null,
): Map<string, number> {
  const value = Array.from({ length: guestCount }, () => 0);
  const room = targets ? targets.map((amount) => Math.max(0, amount / venueGrossMultiplier())) : null;
  const assignment = new Map<string, number>();
  const sorted = [...units].sort((a, b) => b.price - a.price);
  for (const unit of sorted) {
    let best = 0;
    if (room) {
      let bestRoom = -Infinity;
      for (let i = 0; i < guestCount; i += 1) {
        const left = room[i] - value[i];
        if (left > bestRoom) {
          bestRoom = left;
          best = i;
        }
      }
    } else {
      for (let i = 1; i < guestCount; i += 1) {
        if (value[i] < value[best]) best = i;
      }
    }
    assignment.set(unit.key, best + 1);
    value[best] += unit.price;
  }
  const counts = Array.from({ length: guestCount }, () => 0);
  for (const guest of assignment.values()) counts[guest - 1] += 1;
  for (let i = 0; i < guestCount; i += 1) {
    if (counts[i] > 0) continue;
    let donor = 0;
    for (let j = 1; j < guestCount; j += 1) {
      if (counts[j] > counts[donor]) donor = j;
    }
    if (counts[donor] < 2) continue;
    const victim = [...assignment.entries()].find(([, guest]) => guest === donor + 1);
    if (!victim) continue;
    assignment.set(victim[0], i + 1);
    counts[donor] -= 1;
    counts[i] += 1;
  }
  return assignment;
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
  onBillCheckPrinted,
  tables: tablesProp,
  zones: zonesProp,
  onItemsMoved,
}: SplitBillModalProps) {
  const [mode, setMode] = useState<SplitMode>('equal');
  const [splitCount, setSplitCount] = useState(2);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [guestAmounts, setGuestAmounts] = useState<number[]>(() => equalShares(total, 2));
  const [guestMethods, setGuestMethods] = useState<PaymentMethod[]>(['card', 'card']);
  const [guestExtras, setGuestExtras] = useState<PaymentMethod[][]>([[], []]);
  const [guestCashIn, setGuestCashIn] = useState<string[]>(['', '']);
  const [guestRooms, setGuestRooms] = useState<string[]>(['', '']);
  const [guestPartAmounts, setGuestPartAmounts] = useState<Record<string, string>[]>([{}, {}]);
  const [guestCardNames, setGuestCardNames] = useState<CardBrand[]>(['Visa', 'Visa']);
  const [guestCardNumbers, setGuestCardNumbers] = useState<string[]>(['', '']);
  const [processing, setProcessing] = useState(false);
  const [printingCheck, setPrintingCheck] = useState(false);
  const [moveItemIds, setMoveItemIds] = useState<Record<string, boolean>>({});
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [floorTables, setFloorTables] = useState<TableData[]>(tablesProp ?? []);
  const [floorZones, setFloorZones] = useState<ZoneData[]>(zonesProp ?? []);

  const displayTable = tableLabel ?? tableId;
  const rootLabel = displayTable.replace(/\/\d+$/, '');
  const checkLabels = useMemo(
    () => Array.from({ length: splitCount }, (_, i) => `${rootLabel}/${i + 1}`),
    [rootLabel, splitCount],
  );

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
    setGuestExtras([[], []]);
    setGuestCashIn(['', '']);
    setGuestRooms(['', '']);
    setGuestPartAmounts([{}, {}]);
    setGuestCardNames(['Visa', 'Visa']);
    setGuestCardNumbers(['', '']);
    setMoveItemIds({});
    setMoveTargetId(null);
  }, [isOpen, total]);

  useEffect(() => {
    if (tablesProp && tablesProp.length > 0) setFloorTables(tablesProp);
  }, [tablesProp]);

  useEffect(() => {
    if (zonesProp && zonesProp.length > 0) setFloorZones(zonesProp);
  }, [zonesProp]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    if (!tablesProp?.length) {
      tablesApi.list().then((list) => {
        if (!cancelled) setFloorTables(list as TableData[]);
      }).catch(() => { /* keep current */ });
    }
    if (!zonesProp?.length) {
      zonesApi.list().then((list) => {
        if (!cancelled) setFloorZones(list);
      }).catch(() => { /* keep current */ });
    }
    return () => { cancelled = true; };
  }, [isOpen, tablesProp, zonesProp]);

  const moveDestinations = useMemo(
    () => floorTables.filter((t) => t.id !== tableId && t.status !== 'reserved'),
    [floorTables, tableId],
  );

  const selectedMoveCount = items.filter((it) => moveItemIds[it.id]).length;
  const zoneLabel = (zoneId: string) => findZone(floorZones, zoneId)?.label || zoneId || 'Zone';

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
    setGuestExtras(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? []);
    });
    setGuestCashIn(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? '');
    });
    setGuestRooms(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? '');
    });
    setGuestPartAmounts(prev => {
      if (prev.length === splitCount) return prev;
      return Array.from({ length: splitCount }, (_, i) => prev[i] ?? {});
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
  const materializeUnits = async (
    units: ExplodedSplitUnit[],
    staffId: string,
    guestOf: (unit: ExplodedSplitUnit) => number | undefined,
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
        const guest = guestOf(unit);
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

  const materializeByItemAssignments = (
    units: ExplodedSplitUnit[],
    staffId: string,
  ) => materializeUnits(units, staffId, (unit) => assignments[unit.key]);

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
    setGuestExtras(prev => {
      const next = [...prev];
      next[index] = (next[index] ?? []).filter(m => m !== method);
      return next;
    });
  };

  const methodsFor = (index: number): PaymentMethod[] => {
    const first = guestMethods[index] ?? 'card';
    const rest = (guestExtras[index] ?? []).filter(m => m !== first);
    return [first, ...rest];
  };

  const toggleGuestMethod = (index: number, method: PaymentMethod) => {
    const current = methodsFor(index);
    if (current.includes(method)) {
      if (current.length === 1) return;
      const next = current.filter(m => m !== method);
      setGuestMethod(index, next[0]);
      setGuestExtras(prev => {
        const copy = [...prev];
        copy[index] = next.slice(1);
        return copy;
      });
      return;
    }
    if (current.length >= 4) {
      toast.error('Use at most 4 payment methods');
      return;
    }
    setGuestExtras(prev => {
      const copy = [...prev];
      copy[index] = [...(copy[index] ?? []), method];
      return copy;
    });
  };

  const guestPayFields = (index: number, amountDue: number): Partial<SplitPaymentLine> => {
    const methods = methodsFor(index);
    const mixed = methods.length > 1;
    const explicit: Partial<Record<PaymentMethod, number>> = {};
    if (mixed) {
      for (const id of methods) {
        const raw = (guestPartAmounts[index]?.[id] ?? '').trim();
        if (raw !== '') explicit[id] = Math.round((parseFloat(raw) || 0) * 100) / 100;
      }
      if (methods.includes('cash') && explicit.cash == null) {
        const handed = (guestCashIn[index] ?? '').trim();
        if (handed !== '') {
          const n = Math.round((parseFloat(handed) || 0) * 100) / 100;
          const others = methods
            .filter((id) => id !== 'cash')
            .reduce((sum, id) => sum + (explicit[id] ?? 0), 0);
          const remaining = Math.max(0, Math.round((amountDue - others) * 100) / 100);
          const cashAmt = Math.round(Math.min(n, remaining) * 100) / 100;
          const otherTyped = methods.some((id) => id !== 'cash' && explicit[id] != null);
          if (cashAmt > 0 && (otherTyped || cashAmt < amountDue - 0.009)) {
            explicit.cash = cashAmt;
          }
        }
      }
    }
    const blanks = methods.filter((id) => explicit[id] == null);
    const used = methods.reduce((sum, id) => sum + (explicit[id] ?? 0), 0);
    const rest = Math.max(0, Math.round((amountDue - used) * 100) / 100);
    const parts = methods.map((id) => {
      if (!mixed) return { method: id, amount: amountDue };
      if (explicit[id] != null) return { method: id, amount: explicit[id] as number };
      if (blanks.length === 1) return { method: id, amount: rest };
      return { method: id, amount: 0 };
    });
    const cashReceivedRaw = (guestCashIn[index] ?? '').trim();
    const cashReceived = cashReceivedRaw === '' ? undefined : Math.round((parseFloat(cashReceivedRaw) || 0) * 100) / 100;
    if (!mixed) {
      const method = methods[0];
      return {
        method,
        cashTendered: method === 'cash' ? (cashReceived ?? null) : null,
        roomNumber: method === 'room' ? (guestRooms[index] ?? '').trim() || null : null,
        cardName: method === 'card' ? (guestCardNames[index] ?? 'Visa') : null,
        cardNumber: method === 'card' ? (guestCardNumbers[index] ?? '').trim() || null : null,
      };
    }
    const tenders: PaymentTender[] = parts.map(p => ({
      method: p.method,
      amount: p.amount,
      cashTendered: p.method === 'cash' ? (cashReceived ?? p.amount) : undefined,
      roomNumber: p.method === 'room' ? (guestRooms[index] ?? '').trim() || undefined : undefined,
      cardName: p.method === 'card' ? (guestCardNames[index] ?? 'Visa') : undefined,
      cardNumber: p.method === 'card' ? (guestCardNumbers[index] ?? '').trim() || undefined : undefined,
    }));
    return { method: methods[0], tenders };
  };

  const guestPayError = (index: number, amountDue: number, label: string): string | null => {
    const methods = methodsFor(index);
    const fields = guestPayFields(index, amountDue);
    if (methods.includes('card')) {
      const number = fields.tenders
        ? fields.tenders.find(t => t.method === 'card')?.cardNumber
        : fields.cardNumber;
      if (!number?.trim()) return `Enter transaction number for ${label}`;
    }
    if (methods.includes('room')) {
      const room = fields.tenders
        ? fields.tenders.find(t => t.method === 'room')?.roomNumber
        : fields.roomNumber;
      if (!room?.trim()) return `Enter a room number for ${label}`;
    }
    if (methods.length > 1) {
      const parts = fields.tenders ?? [];
      if (parts.some(t => (t.amount ?? 0) <= 0)) return `Each method for ${label} needs an amount`;
      const sum = parts.reduce((s, t) => s + (t.amount ?? 0), 0);
      if (Math.abs(sum - amountDue) > 0.02) return `${label} tenders must equal $${amountDue.toFixed(2)}`;
    }
    if (methods.includes('cash')) {
      const raw = (guestCashIn[index] ?? '').trim();
      if (raw !== '') {
        const cashPortion = methods.length > 1
          ? (fields.tenders?.find(t => t.method === 'cash')?.amount ?? 0)
          : amountDue;
        const received = parseFloat(raw) || 0;
        if (received + 0.009 < cashPortion) return `Insufficient cash tendered for ${label}`;
      }
    }
    return null;
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

  const withCardFields = (line: SplitPaymentLine, guestIndex: number): SplitPaymentLine => ({
    ...line,
    ...guestPayFields(guestIndex, line.amount),
  });

  /** Shared validation for print-check and pay (partition rules). */
  const validateSplitSetup = (): boolean => {
    if (items.length === 0) {
      toast.error('No items to split');
      return false;
    }
    if (splitCount < MIN_WAYS) {
      toast.error(`Split needs at least ${MIN_WAYS} guests`);
      return false;
    }
    if (mode === 'byitem') {
      const unassigned = splitUnits.filter((unit) => !assignments[unit.key]);
      if (unassigned.length > 0) {
        toast.error('Assign every item unit to a guest');
        return false;
      }
    }
    const maxShares = Math.max(items.length, splitUnits.length);
    if ((mode === 'equal' || mode === 'amount') && splitCount > maxShares) {
      toast.error(`Use at most ${maxShares} ways (${maxShares} item units on the check)`);
      return false;
    }
    if (mode === 'amount' && Math.abs(amountDelta) > 0.02) {
      toast.error(`Split amounts must equal $${total.toFixed(2)} (currently $${amountSum.toFixed(2)})`);
      return false;
    }
    return true;
  };

  /**
   * Build guest → itemIds partition for unpaid bill checks (and pay).
   * Equal and By $ always send the on-screen amount so the check TOTAL matches.
   */
  const resolvePrintSplits = async (staffId: string): Promise<PrintSplitReceiptLine[] | null> => {
    let splits: PrintSplitReceiptLine[] = [];

    if (mode === 'equal' || mode === 'amount') {
      const shares = mode === 'equal'
        ? equalShares(total, splitCount)
        : guestAmounts.map((amount) => Math.round(amount * 100) / 100);
      const paying = shares
        .map((amount, guestIndex) => ({ amount, guestIndex }))
        .filter((row) => row.amount > 0);
      if (paying.length < MIN_WAYS) {
        toast.error(`Need at least ${MIN_WAYS} guests with an amount`);
        return null;
      }
      let guestItemIds: Map<number, string[]>;
      try {
        const targets = mode === 'amount' ? paying.map((row) => row.amount) : null;
        const guestOfUnit = assignUnitsToGuests(splitUnits, paying.length, targets);
        guestItemIds = await materializeUnits(splitUnits, staffId, (unit) => guestOfUnit.get(unit.key));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not split item quantities');
        return null;
      }
      splits = paying.map((row, idx) => ({
        guestLabel: `Guest ${row.guestIndex + 1}`,
        itemIds: [...new Set(guestItemIds.get(idx + 1) ?? [])],
        amount: row.amount,
        tip: 0,
      })).filter((s) => s.itemIds.length > 0 && s.amount > 0);
    } else {
      const guestItemIds = await materializeByItemAssignments(splitUnits, staffId);
      splits = Array.from({ length: splitCount }).map((_, i) => {
        const guestNum = i + 1;
        return {
          guestLabel: `Guest ${guestNum}`,
          itemIds: [...new Set(guestItemIds.get(guestNum) ?? [])],
          tip: 0,
        };
      }).filter((s) => s.itemIds.length > 0);
    }

    if (splits.length < MIN_WAYS) {
      toast.error(`Need at least ${MIN_WAYS} guests with items`);
      return null;
    }

    const partitionedIds = splits.flatMap((s) => s.itemIds);
    if (!isValidItemPartition(partitionedIds, splits.map((s) => s.itemIds))) {
      toast.error('Each guest needs at least one item, and every item must be assigned once');
      return null;
    }

    return splits;
  };

  const toggleMoveItem = (itemId: string) => {
    setMoveItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleSplitTable = async () => {
    const staffId = getAuthUser()?.id;
    if (!staffId) {
      toast.error('Sign in again to split this table');
      return;
    }
    if (splitCount < MIN_WAYS) {
      toast.error(`Split into at least ${MIN_WAYS} checks`);
      return;
    }
    const qtyMaps: Record<string, number>[] = Array.from({ length: splitCount }, () => ({}));
    if (mode === 'byitem') {
      for (const unit of splitUnits) {
        const guest = assignments[unit.key] ?? 1;
        const idx = Math.min(splitCount, Math.max(1, guest)) - 1;
        qtyMaps[idx][unit.sourceId] = (qtyMaps[idx][unit.sourceId] ?? 0) + 1;
      }
    } else {
      const guestOf = assignUnitsToGuests(splitUnits, splitCount, null);
      for (const unit of splitUnits) {
        const guest = guestOf.get(unit.key) ?? 1;
        const idx = Math.min(splitCount, Math.max(1, guest)) - 1;
        qtyMaps[idx][unit.sourceId] = (qtyMaps[idx][unit.sourceId] ?? 0) + 1;
      }
    }
    const splits: SplitTableShare[] = qtyMaps.map((qty) => ({
      lines: Object.entries(qty).map(([itemId, q]) => ({ itemId, qty: q })),
    }));
    setProcessing(true);
    try {
      const result = await tablesApi.split({
        sourceTableId: tableId,
        staffId,
        splits,
      });
      toast.success(result.message || `Split into ${checkLabels.join(', ')}`);
      onSplitComplete?.(result.tables);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to split table');
    } finally {
      setProcessing(false);
    }
  };

  const handleMoveItems = async () => {
    const itemIds = items.filter((it) => moveItemIds[it.id]).map((it) => it.id);
    if (itemIds.length === 0) {
      toast.error('Select at least one item to move');
      return;
    }
    if (!moveTargetId) {
      toast.error('Select a destination table');
      return;
    }
    const staffId = getAuthUser()?.id;
    if (!staffId) {
      toast.error('Sign in again to move items');
      return;
    }
    const dest = moveDestinations.find((t) => t.id === moveTargetId);
    setProcessing(true);
    try {
      const result = await tablesApi.transfer({
        sourceTableId: tableId,
        targetTableId: moveTargetId,
        staffId,
        itemIds,
      });
      toast.success(result.message || `${itemIds.length} item${itemIds.length === 1 ? '' : 's'} moved to ${dest?.label ?? moveTargetId}`);
      onItemsMoved?.(moveTargetId);
      onSplitComplete?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move items');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintBillCheck = async () => {
    if (!validateSplitSetup()) return;
    const staffId = getAuthUser()?.id;
    if (!staffId) {
      toast.error('Sign in again to print bill checks');
      return;
    }

    setPrintingCheck(true);
    try {
      const splits = await resolvePrintSplits(staffId);
      if (!splits) return;

      // Same zone receipt printer as Confirm Split & Pay — unpaid guest checks only.
      const result = await receiptsApi.printSplit({
        tableId,
        staffId,
        splits,
      });

      const printed = Number(result.receiptsPrinted) || 0;
      const requested = Number(result.receiptsRequested) || splits.length;
      if (printed > 0 && printed === requested) {
        toast.success(result.receiptPrintMessage || `${printed} split bill checks printed`);
      } else if (printed > 0) {
        toast.error(result.receiptPrintMessage || `Only ${printed}/${requested} bill checks printed`);
      } else {
        toast.error(result.receiptPrintMessage || 'Bill checks sent but printer did not confirm');
      }
      onBillCheckPrinted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to print split bill checks');
    } finally {
      setPrintingCheck(false);
    }
  };

  const handleConfirm = async () => {
    const lineItems = items.map(it => ({ id: it.id, qty: it.qty, price: it.price }));
    const allIds = lineItems.map(it => it.id);

    if (!validateSplitSetup()) return;

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

        const payProblem = splits
          .map((s) => guestPayError(parseInt(s.guestLabel.replace(/\D/g, ''), 10) - 1, s.amount, s.guestLabel))
          .find((msg): msg is string => Boolean(msg));
        if (payProblem) {
          toast.error(payProblem);
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

      const payProblem = splits
        .map((s) => guestPayError(parseInt(s.guestLabel.replace(/\D/g, ''), 10) - 1, s.amount, s.guestLabel))
        .find((msg): msg is string => Boolean(msg));
      if (payProblem) {
        toast.error(payProblem);
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

  const dueForGuest = (index: number): number => {
    if (mode === 'amount') return Math.round((guestAmounts[index] ?? 0) * 100) / 100;
    if (mode === 'equal') return equalShares(total, splitCount)[index] ?? 0;
    const guestNum = index + 1;
    const orderSub = splitUnits.reduce((sum, unit) => sum + unit.price, 0);
    if (orderSub <= 0) return 0;
    const guests = Array.from({ length: splitCount }, (_, i) => i + 1)
      .filter((n) => splitUnits.some((unit) => assignments[unit.key] === n));
    const amounts = guests.map((n) => {
      const sub = splitUnits
        .filter((unit) => assignments[unit.key] === n)
        .reduce((sum, unit) => sum + unit.price, 0);
      return Math.round((sub / orderSub) * total * 100) / 100;
    });
    const shareSum = amounts.reduce((sum, value) => sum + value, 0);
    if (amounts.length > 0) {
      amounts[amounts.length - 1] += Math.round((total - shareSum) * 100) / 100;
    }
    const pos = guests.indexOf(guestNum);
    return pos >= 0 ? amounts[pos] : 0;
  };

  const renderGuestPay = (index: number, amountDue: number) => {
    const methods = methodsFor(index);
    const mixed = methods.length > 1;
    const fields = guestPayFields(index, amountDue);
    const cashPortion = methods.includes('cash')
      ? (mixed ? (fields.tenders?.find((t) => t.method === 'cash')?.amount ?? 0) : amountDue)
      : 0;
    const cashRaw = (guestCashIn[index] ?? '').trim();
    const cashReceived = cashRaw === '' ? cashPortion : (parseFloat(cashRaw) || 0);
    const cashChange = Math.round((cashReceived - cashPortion) * 100) / 100;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const on = methods.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleGuestMethod(index, m.id)}
                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${
                  on
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Amount due ${amountDue.toFixed(2)}
          {mixed ? ' · enter how much cash, card, QR, or room pays' : ''}
        </p>
        {mixed && methods.filter((id) => id !== 'cash').map((id) => {
          const part = fields.tenders?.find((t) => t.method === id);
          const typed = (guestPartAmounts[index]?.[id] ?? '').trim();
          const shown = typed !== ''
            ? (guestPartAmounts[index]?.[id] ?? '')
            : (part && (part.amount ?? 0) > 0 ? part.amount!.toFixed(2) : '');
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12 capitalize">{id}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={shown}
                onChange={(e) => {
                  const value = e.target.value;
                  setGuestPartAmounts((prev) => {
                    const next = [...prev];
                    next[index] = { ...(next[index] ?? {}), [id]: value };
                    return next;
                  });
                }}
                className="h-8 w-28 rounded-lg border border-border bg-muted/20 px-2 text-xs text-tabular"
                placeholder="0.00"
              />
            </div>
          );
        })}
        {methods.includes('cash') && (
          <div className="space-y-1">
            {mixed && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-12">On bill</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={(() => {
                    const typed = (guestPartAmounts[index]?.cash ?? '').trim();
                    if (typed !== '') return guestPartAmounts[index]?.cash ?? '';
                    const part = fields.tenders?.find((t) => t.method === 'cash');
                    return part && (part.amount ?? 0) > 0 ? part.amount!.toFixed(2) : '';
                  })()}
                  onChange={(e) => {
                    const value = e.target.value;
                    setGuestPartAmounts((prev) => {
                      const next = [...prev];
                      next[index] = { ...(next[index] ?? {}), cash: value };
                      return next;
                    });
                  }}
                  className="h-8 w-28 rounded-lg border border-border bg-muted/20 px-2 text-xs text-tabular"
                  placeholder="0.00"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12">Handed</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={guestCashIn[index] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setGuestCashIn((prev) => {
                    const next = [...prev];
                    next[index] = value;
                    return next;
                  });
                }}
                placeholder={cashPortion.toFixed(2)}
                className="h-8 w-28 rounded-lg border border-border bg-muted/20 px-2 text-xs text-tabular"
              />
            </div>
            <p className={`text-[11px] font-semibold ${cashChange < -0.009 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {cashChange < -0.009
                ? `Short $${Math.abs(cashChange).toFixed(2)}`
                : `Give the guest $${cashChange.toFixed(2)} · អាប់ ${formatChangeRiel(cashChange)}`}
            </p>
          </div>
        )}
        {methods.includes('card') && (
          <GuestCardFields
            cardName={guestCardNames[index] ?? 'Visa'}
            cardNumber={guestCardNumbers[index] ?? ''}
            onCardNameChange={(brand) => setGuestCardName(index, brand)}
            onCardNumberChange={(value) => setGuestCardNumber(index, value)}
          />
        )}
        {methods.includes('room') && (
          <input
            type="text"
            value={guestRooms[index] ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              setGuestRooms((prev) => {
                const next = [...prev];
                next[index] = value;
                return next;
              });
            }}
            placeholder="Room number"
            className="w-full h-9 rounded-xl border border-border bg-muted/20 px-3 text-sm"
          />
        )}
      </div>
    );
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
                {mode !== 'totable' && mode !== 'amount' ? ` → ${checkLabels.join(', ')}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
          <div className="grid grid-cols-4 gap-2">
            {([
              { id: 'equal' as const, label: 'Equal', icon: Users },
              { id: 'amount' as const, label: 'By $', icon: SplitSquareHorizontal },
              { id: 'byitem' as const, label: 'By item', icon: SplitSquareHorizontal },
              { id: 'totable' as const, label: 'To table', icon: ArrowLeftRight },
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

          {mode !== 'totable' && (
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-2">
              {mode === 'amount' ? 'Number of ways' : mode === 'byitem' ? 'Number of checks' : 'Number of checks'}
            </p>
            <SplitCountField value={splitCount} onChange={setSplitCount} />
          </div>
          )}

          {mode === 'equal' && (
            <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-2 fade-in">
              <p className="text-xs text-muted-foreground">
                Creates separate tables {checkLabels.join(', ')}. Items are divided evenly. You can add more items or pay each check on its own.
              </p>
              {checkLabels.map((label, i) => (
                <div key={`equal-share-${i}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-primary font-bold text-tabular">
                    ${equalShares(total, splitCount)[i]?.toFixed(2)}
                  </span>
                </div>
              ))}
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
                  </div>
                  {renderGuestPay(i, Math.round((amt || 0) * 100) / 100)}
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
                Assign each item to {checkLabels.join(', ')}. Unassigned items stay on {checkLabels[0]}.
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
                    {checkLabels.map((label, gi) => (
                      <button
                        key={`assign-${unit.key}-g${gi}`}
                        type="button"
                        onClick={() => assignUnit(unit.key, gi + 1)}
                        className={`min-w-8 h-8 px-1 rounded-lg border text-[10px] font-semibold transition-all duration-100 ${
                          assignments[unit.key] === gi + 1
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === 'totable' && (
            <div className="space-y-4 fade-in">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">
                  Items to move
                  {selectedMoveCount > 0 ? ` · ${selectedMoveCount} selected` : ''}
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Tap items to send them to another table. The rest stay on this check.
                </p>
                <div className="space-y-2">
                  {items.map((it) => {
                    const on = !!moveItemIds[it.id];
                    return (
                      <button
                        key={`move-${it.id}`}
                        type="button"
                        onClick={() => toggleMoveItem(it.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          on
                            ? 'bg-primary/15 border-primary/40'
                            : 'bg-muted/20 border-border hover:bg-muted/30'
                        }`}
                      >
                        <div className="min-w-0 mr-3">
                          <p className="text-sm text-foreground font-medium truncate">
                            {it.qty}× {it.name}
                            {it.size ? ` · ${it.size}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground text-tabular">
                            ${(it.price * it.qty).toFixed(2)}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold ${on ? 'text-primary' : 'text-muted-foreground'}`}>
                          {on ? 'Move' : 'Stay'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Destination table</p>
                {moveDestinations.length === 0 ? (
                  <p className="text-xs text-amber-400">No other tables available</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-2">
                    {moveDestinations.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setMoveTargetId(t.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          moveTargetId === t.id
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'border-border text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold">{t.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {zoneLabel(t.zone)} · {t.status}
                            {t.orderTotal > 0 ? ` · $${Number(t.orderTotal).toFixed(2)}` : ''}
                          </p>
                        </div>
                        {moveTargetId === t.id && <Check size={16} className="text-primary flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        <div className="p-5 border-t border-border space-y-2">
          {mode === 'totable' ? (
            <>
              <button
                type="button"
                onClick={() => void handleMoveItems()}
                disabled={processing || selectedMoveCount === 0 || !moveTargetId}
                className="w-full btn-primary rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ArrowLeftRight size={16} />
                {processing ? 'Moving…' : 'Move items'}
              </button>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Selected items go to the other table. Remaining items stay on this check.
              </p>
            </>
          ) : mode === 'amount' ? (
            <>
          <button
            type="button"
            onClick={() => void handlePrintBillCheck()}
            disabled={processing || printingCheck}
            className="w-full rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 hover:border-amber-500/40 transition-all"
          >
            <Printer size={16} />
            {printingCheck ? 'Printing…' : 'Print Bill Check'}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing || printingCheck}
            className="w-full btn-primary rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={16} />
            {processing ? 'Processing…' : 'Confirm Split & Pay'}
          </button>
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Print unpaid checks for guests first, then collect payment when ready.
          </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleSplitTable()}
                disabled={processing}
                className="w-full btn-primary rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <SplitSquareHorizontal size={16} />
                {processing ? 'Splitting…' : `Split into ${checkLabels.join(' · ')}`}
              </button>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Each check is its own table. Add items or pay {checkLabels.join(' and ')} separately.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
