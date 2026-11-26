'use client';

import React, { useEffect, useState } from 'react';
import { X, CreditCard, Banknote, QrCode, BedDouble, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { menuApi, menuCategoryApi, paymentsApi } from '@/lib/api/client';
import { applyVenueRates, loadVenueRates, venueGrossMultiplier, DEFAULT_VENUE_RATES } from '@/lib/venueRates';
import { getAuthUser } from '@/lib/api/config';
import type { PaymentMethod } from '@/lib/api/types';
import { formatChangeRiel } from '@/lib/receiptMoney';
import {
  aggregateSalesFromLineItems,
  buildMenuCategoryLookup,
  type ReportLineItemLike,
} from '@/app/reports/reportDocumentHelpers';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  subtotal?: number;
  serviceCharge?: number;
  vat?: number;
  tableId: string;
  guestCount?: number;
  /** Open check lines — used to compute food/drink subtotals on pay (optional) */
  orderLineItems?: ReportLineItemLike[];
  onPaymentComplete?: () => void;
}

type PayMethod = PaymentMethod;

const CARD_BRANDS = ['Visa', 'Amex', 'Master', 'Union'] as const;
type CardBrand = (typeof CARD_BRANDS)[number];

const DISCOUNT_KINDS = [
  { id: 'total', label: 'Total' },
  { id: 'food', label: 'Food' },
  { id: 'drink', label: 'Drink' },
  { id: 'items', label: 'By item' },
] as const;
type DiscountKind = (typeof DISCOUNT_KINDS)[number]['id'];

type ItemDiscountDraft = { amount: string; percent: string };

function moneyInput(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function percentInput(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Same rounding as the API: percent of base, half-up to cents. */
function percentMoney(percent: number, base: number): number {
  if (percent <= 0 || base <= 0) return 0;
  return Math.round((base * percent) / 100 * 100) / 100;
}

function resolvedTenderParts(
  methods: PayMethod[],
  amounts: Partial<Record<PayMethod, string>>,
  due: number,
  cashHanded = '',
): { method: PayMethod; amount: number; autoRemainder: boolean }[] {
  const typed = (id: PayMethod): number | null => {
    const raw = amounts[id];
    if (raw == null || String(raw).trim() === '') return null;
    return moneyInput(String(raw));
  };
  if (methods.length <= 1) {
    return methods.map((id) => ({ method: id, amount: due, autoRemainder: false }));
  }
  const explicit: Partial<Record<PayMethod, number>> = {};
  for (const id of methods) {
    const value = typed(id);
    if (value != null) explicit[id] = value;
  }
  if (methods.includes('cash') && explicit.cash == null) {
    const handed = moneyInput(cashHanded);
    if (handed > 0) {
      const others = methods
        .filter((id) => id !== 'cash')
        .reduce((sum, id) => sum + (explicit[id] ?? 0), 0);
      const remaining = Math.max(0, Math.round((due - others) * 100) / 100);
      const cashAmt = Math.round(Math.min(handed, remaining) * 100) / 100;
      const otherTyped = methods.some((id) => id !== 'cash' && explicit[id] != null);
      if (cashAmt > 0 && (otherTyped || cashAmt < due - 0.009)) {
        explicit.cash = cashAmt;
      }
    }
  }
  const empty = methods.filter((id) => explicit[id] == null);
  return methods.map((id) => {
    if (explicit[id] != null) {
      return { method: id, amount: explicit[id] as number, autoRemainder: false };
    }
    if (empty.length === 1) {
      const others = methods.filter((m) => m !== id).reduce((sum, m) => sum + (explicit[m] ?? 0), 0);
      return {
        method: id,
        amount: Math.max(0, Math.round((due - others) * 100) / 100),
        autoRemainder: true,
      };
    }
    return { method: id, amount: 0, autoRemainder: false };
  });
}

function DiscountKindFields({
  label,
  hint,
  amount,
  percent,
  base,
  onAmount,
  onPercent,
}: {
  label: string;
  hint?: string;
  amount: string;
  percent: string;
  base: number;
  onAmount: (value: string) => void;
  onPercent: (value: string) => void;
}) {
  const fixed = moneyInput(amount);
  const pct = percentInput(percent);
  const fromPercent = percentMoney(pct, base);
  const combined = Math.round((fixed + fromPercent) * 100) / 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-medium">{label}</label>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          placeholder="Amount $"
          aria-label={`${label} amount`}
          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
        />
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => onPercent(e.target.value)}
            placeholder="Percent"
            aria-label={`${label} percent`}
            className="w-full bg-input border border-border rounded-lg pl-3 pr-7 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
      </div>
      {pct > 0 ? (
        <p className="text-[10px] text-emerald-400">
          {pct}% of ${base.toFixed(2)} = ${fromPercent.toFixed(2)}
          {fixed > 0 ? ` · with $${fixed.toFixed(2)} = $${combined.toFixed(2)}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export default function PaymentModal({
  isOpen,
  onClose,
  total,
  subtotal,
  serviceCharge,
  vat,
  tableId,
  guestCount = 1,
  orderLineItems,
  onPaymentComplete,
}: PaymentModalProps) {
  const [selectedMethods, setSelectedMethods] = useState<PayMethod[]>(['card']);
  const [tenderAmounts, setTenderAmounts] = useState<Partial<Record<PayMethod, string>>>({});
  const [cashReceived, setCashReceived] = useState('');
  const [cardName, setCardName] = useState<CardBrand>('Visa');
  const [cardNumber, setCardNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [tip, setTip] = useState('');
  const [discountKinds, setDiscountKinds] = useState<DiscountKind[]>([]);
  const [discountTotal, setDiscountTotal] = useState('');
  const [discountFood, setDiscountFood] = useState('');
  const [discountDrink, setDiscountDrink] = useState('');
  const [discountTotalPercent, setDiscountTotalPercent] = useState('');
  const [discountFoodPercent, setDiscountFoodPercent] = useState('');
  const [discountDrinkPercent, setDiscountDrinkPercent] = useState('');
  const [itemDiscountDrafts, setItemDiscountDrafts] = useState<Record<string, ItemDiscountDraft>>({});
  const [foodSubtotalCap, setFoodSubtotalCap] = useState<number | null>(null);
  const [drinkSubtotalCap, setDrinkSubtotalCap] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rates, setRates] = useState(DEFAULT_VENUE_RATES);

  const discountableItems = (orderLineItems ?? []).filter(
    (it) => it.id && (it.status == null || it.status !== 'Voided'),
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadVenueRates().then(setRates);
    setSelectedMethods(['card']);
    setTenderAmounts({});
    setCashReceived('');
    setCardName('Visa');
    setCardNumber('');
    setRoomNumber('');
    setTip('');
    setDiscountKinds([]);
    setDiscountTotal('');
    setDiscountFood('');
    setDiscountDrink('');
    setDiscountTotalPercent('');
    setDiscountFoodPercent('');
    setDiscountDrinkPercent('');
    setItemDiscountDrafts({});
    setFoodSubtotalCap(null);
    setDrinkSubtotalCap(null);
    setProcessing(false);
    setSuccess(false);
  }, [isOpen, tableId]);

  useEffect(() => {
    if (!isOpen || !orderLineItems?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const [categories, menuItems] = await Promise.all([
          menuCategoryApi.list(),
          menuApi.list(),
        ]);
        if (cancelled) return;
        const lookup = buildMenuCategoryLookup(categories, menuItems);
        const split = aggregateSalesFromLineItems(orderLineItems, lookup);
        setFoodSubtotalCap(split.food);
        setDrinkSubtotalCap(split.drink);
      } catch {
        /* caps stay unknown; payment still accepts the amounts */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderLineItems]);

  const tipAmount = Math.max(0, parseFloat(tip || '0') || 0);
  const billOn = discountKinds.includes('total');
  const foodOn = discountKinds.includes('food');
  const drinkOn = discountKinds.includes('drink');
  const itemsOn = discountKinds.includes('items');
  const billDiscount = billOn ? moneyInput(discountTotal) : 0;
  const foodDiscount = foodOn ? moneyInput(discountFood) : 0;
  const drinkDiscount = drinkOn ? moneyInput(discountDrink) : 0;
  const billPercent = billOn ? percentInput(discountTotalPercent) : 0;
  const foodPercent = foodOn ? percentInput(discountFoodPercent) : 0;
  const drinkPercent = drinkOn ? percentInput(discountDrinkPercent) : 0;
  const foodBase = foodSubtotalCap ?? 0;
  const drinkBase = drinkSubtotalCap ?? 0;
  const billPercentAmount = percentMoney(billPercent, total);
  const foodPercentAmount = percentMoney(foodPercent, foodBase);
  const drinkPercentAmount = percentMoney(drinkPercent, drinkBase);

  const itemDiscountRows = itemsOn
    ? discountableItems.map((it) => {
        const id = String(it.id);
        const draft = itemDiscountDrafts[id] ?? { amount: '', percent: '' };
        const lineTotal = Math.round((Number(it.unitPrice) || 0) * (Number(it.qty) || 1) * 100) / 100;
        const fixed = moneyInput(draft.amount);
        const pct = percentInput(draft.percent);
        const fromPercent = percentMoney(pct, lineTotal);
        const lineDiscount = Math.round((fixed + fromPercent) * 100) / 100;
        return { id, name: it.name, qty: it.qty, lineTotal, fixed, pct, fromPercent, lineDiscount, draft };
      })
    : [];
  const itemsDiscountSum = Math.round(
    itemDiscountRows.reduce((s, r) => s + r.lineDiscount, 0) * 100,
  ) / 100;

  const discountSum = Math.round((
    billDiscount + foodDiscount + drinkDiscount + itemsDiscountSum
    + billPercentAmount + foodPercentAmount + drinkPercentAmount
  ) * 100) / 100;
  const amountDue = Math.max(0, Math.round((total - discountSum) * 100) / 100);
  const method = selectedMethods[0] ?? 'card';
  const mixedTender = selectedMethods.length > 1;

  const tenderParts = resolvedTenderParts(selectedMethods, tenderAmounts, amountDue, cashReceived);
  const tenderAllocated = Math.round(tenderParts.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
  const tenderRemaining = Math.round((amountDue - tenderAllocated) * 100) / 100;
  const amountFieldValue = (id: PayMethod) => {
    const typed = (tenderAmounts[id] ?? '').trim();
    if (typed !== '') return tenderAmounts[id] ?? '';
    const part = tenderParts.find((t) => t.method === id);
    return part && part.amount > 0 ? part.amount.toFixed(2) : '';
  };
  const cashPortion = tenderParts.find((t) => t.method === 'cash')?.amount ?? 0;
  const cashGiven = selectedMethods.includes('cash')
    ? ((cashReceived.trim() !== '' ? moneyInput(cashReceived) : 0) || cashPortion)
    : 0;
  const cashChange = selectedMethods.includes('cash')
    ? Math.round((cashGiven - cashPortion) * 100) / 100
    : 0;

  const toggleMethod = (id: PayMethod) => {
    setSelectedMethods((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        setTenderAmounts((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        return prev.filter((m) => m !== id);
      }
      return [...prev, id];
    });
  };

  const setItemDiscountField = (itemId: string, field: keyof ItemDiscountDraft, value: string) => {
    setItemDiscountDrafts((prev) => ({
      ...prev,
      [itemId]: {
        amount: prev[itemId]?.amount ?? '',
        percent: prev[itemId]?.percent ?? '',
        [field]: value,
      },
    }));
  };

  const toggleDiscountKind = (kind: DiscountKind) => {
    setDiscountKinds((prev) => (
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    ));
  };
  const cardReady =
    !selectedMethods.includes('card')
    || (Boolean(cardName) && cardNumber.trim().length > 0);

  const handleProcess = async () => {
    if (selectedMethods.includes('card') && !cardNumber.trim()) {
      toast.error('Enter the card transaction number');
      return;
    }
    if (selectedMethods.includes('room') && !roomNumber.trim()) {
      toast.error('Enter a room number');
      return;
    }
    if (mixedTender && tenderParts.some((t) => t.amount <= 0)) {
      toast.error('Enter how much each method pays. Leave one blank to use the rest.');
      return;
    }
    const tenderSum = Math.round(tenderParts.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    if (mixedTender && Math.abs(tenderSum - amountDue) > 0.02) {
      toast.error(`Tender amounts must equal $${amountDue.toFixed(2)}`);
      return;
    }
    if (selectedMethods.includes('cash') && cashChange < -0.009) {
      toast.error('Cash received is less than the cash portion');
      return;
    }
    if (billPercent > 100 || foodPercent > 100 || drinkPercent > 100) {
      toast.error('Discount percent cannot be more than 100');
      return;
    }
    if (itemDiscountRows.some((r) => r.pct > 100)) {
      toast.error('Item discount percent cannot be more than 100');
      return;
    }
    const overLine = itemDiscountRows.find((r) => r.lineDiscount - r.lineTotal > 0.009);
    if (overLine) {
      toast.error(`Discount on ${overLine.name} cannot exceed $${overLine.lineTotal.toFixed(2)}`);
      return;
    }
    if (itemsOn && itemsDiscountSum <= 0) {
      toast.error('Enter a $ or % discount on at least one item');
      return;
    }
    if (discountSum - total > 0.009) {
      toast.error('Discounts cannot be more than the bill total');
      return;
    }
    if (foodSubtotalCap != null && foodDiscount + foodPercentAmount - foodSubtotalCap > 0.009) {
      toast.error(`Food discount cannot be more than $${foodSubtotalCap.toFixed(2)}`);
      return;
    }
    if (drinkSubtotalCap != null && drinkDiscount + drinkPercentAmount - drinkSubtotalCap > 0.009) {
      toast.error(`Drink discount cannot be more than $${drinkSubtotalCap.toFixed(2)}`);
      return;
    }

    setProcessing(true);
    try {
      const billed = applyVenueRates(subtotal ?? total / venueGrossMultiplier(rates), rates);
      const resolvedSubtotal = subtotal ?? billed.subtotal;
      const resolvedService = serviceCharge ?? billed.serviceCharge;
      const resolvedVat = vat ?? billed.vat;

      const authUser = getAuthUser();
      const staffId = authUser?.id;

      let foodSubtotal: number | undefined;
      let drinkSubtotal: number | undefined;
      if (orderLineItems?.length) {
        try {
          const [categories, menuItems] = await Promise.all([
            menuCategoryApi.list(),
            menuApi.list(),
          ]);
          const lookup = buildMenuCategoryLookup(categories, menuItems);
          const split = aggregateSalesFromLineItems(orderLineItems, lookup);
          if (split.food > 0 || split.drink > 0) {
            foodSubtotal = split.food;
            drinkSubtotal = split.drink;
          }
        } catch {
          /* pay without category split if menu unavailable */
        }
      }

      const itemDiscounts = itemDiscountRows
        .filter((r) => r.lineDiscount > 0)
        .map((r) => ({
          itemId: r.id,
          amount: r.fixed > 0 ? r.fixed : undefined,
          percent: r.pct > 0 ? r.pct : undefined,
        }));

      const cashTendered = selectedMethods.includes('cash')
        ? (moneyInput(cashReceived) || cashPortion)
        : null;
      const tenders = mixedTender
        ? tenderParts.map((t) => ({
            method: t.method,
            amount: t.amount,
            cashTendered: t.method === 'cash' ? cashTendered : undefined,
            roomNumber: t.method === 'room' ? roomNumber.trim() : undefined,
            cardName: t.method === 'card' ? cardName : undefined,
            cardNumber: t.method === 'card' ? cardNumber.trim() : undefined,
          }))
        : undefined;

      const result = await paymentsApi.process({
        tableId,
        guestCount: Math.max(1, guestCount),
        method,
        cardName: selectedMethods.includes('card') ? cardName : null,
        cardNumber: selectedMethods.includes('card') ? cardNumber.trim() : null,
        subtotal: resolvedSubtotal,
        serviceCharge: resolvedService,
        vat: resolvedVat,
        total,
        foodSubtotal,
        drinkSubtotal,
        cashTendered,
        tenders,
        roomNumber: selectedMethods.includes('room') ? roomNumber.trim() : null,
        tip: tipAmount > 0 ? tipAmount : 0,
        discountTotal: billDiscount,
        discountFood: foodDiscount,
        discountDrink: drinkDiscount,
        discountTotalPercent: billPercent,
        discountFoodPercent: foodPercent,
        discountDrinkPercent: drinkPercent,
        itemDiscounts: itemDiscounts.length > 0 ? itemDiscounts : undefined,
        staffId,
        cashierId: staffId,
      });

      setSuccess(true);
      setTimeout(() => {
        const methodLabel = mixedTender
          ? selectedMethods.map((m) => m.toUpperCase()).join(' + ')
          : method === 'card' ? `${cardName.toUpperCase()} CARD` : method.toUpperCase();
        const changeNote = result.change && result.change > 0
          ? ` · change $${Number(result.change).toFixed(2)} (${formatChangeRiel(Number(result.change))})`
          : '';
        toast.success(`Payment of $${amountDue.toFixed(2)} processed via ${methodLabel}${changeNote}`, { duration: 3000 });
        if (result.receiptPrinted === false) {
          toast.warning(
            result.receiptPrintMessage?.trim()
              || 'Receipt did not print — check the receipt printer in Admin Config.',
            { duration: 6000 },
          );
        }
        setSuccess(false);
        onClose();
        onPaymentComplete?.();
      }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  const methods: { id: PayMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'card', label: 'Card', icon: <CreditCard size={18} /> },
    { id: 'cash', label: 'Cash', icon: <Banknote size={18} /> },
    { id: 'qr', label: 'QR Code', icon: <QrCode size={18} /> },
    { id: 'room', label: 'Room Charge', icon: <BedDouble size={18} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-3 md:p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-md slide-up max-h-[95vh] overflow-y-auto">
        {success ? (
          <div className="p-8 md:p-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center neon-emerald">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Payment Successful</h3>
            <p className="text-muted-foreground text-sm">${amountDue.toFixed(2)} — {tableId}</p>
            {cashChange > 0 ? (
              <p className="text-amber-400 text-sm font-semibold text-tabular">Change ${cashChange.toFixed(2)}</p>
            ) : null}
          </div>
        ) : (
          <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <div>
                <h3 className="text-base font-semibold text-foreground">Process Payment</h3>
                <p className="text-xs text-muted-foreground">{tableId} · Total Due</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="text-center py-3 md:py-4 mb-4 md:mb-5 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-3xl md:text-4xl font-bold text-primary text-tabular">${amountDue.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Amount Due</p>
              {discountSum > 0 ? (
                <p className="text-[11px] text-emerald-400 mt-1.5">
                  Bill ${total.toFixed(2)} − discount ${discountSum.toFixed(2)}
                </p>
              ) : null}
              {tipAmount > 0 ? (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Tip ${tipAmount.toFixed(2)} (recorded separately)
                </p>
              ) : null}
              {selectedMethods.includes('cash') && cashChange > 0 ? (
                <p className="text-sm font-semibold text-amber-400 mt-2 text-tabular">
                  Change due ${cashChange.toFixed(2)}
                </p>
              ) : null}
            </div>

            <div className="mb-4 md:mb-5 space-y-2">
              <label className="text-xs text-muted-foreground block font-medium">Discount</label>
              <div className="grid grid-cols-4 gap-1.5">
                {DISCOUNT_KINDS.map((kind) => {
                  const on = discountKinds.includes(kind.id);
                  return (
                    <button
                      key={kind.id}
                      type="button"
                      onClick={() => toggleDiscountKind(kind.id)}
                      className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                        on
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground'
                      }`}
                    >
                      {kind.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">Select one or more. Enter a dollar amount, a percent, or both.</p>
              {billOn && (
                <DiscountKindFields
                  label="Discount on total"
                  hint={`Bill $${total.toFixed(2)}`}
                  amount={discountTotal}
                  percent={discountTotalPercent}
                  base={total}
                  onAmount={setDiscountTotal}
                  onPercent={setDiscountTotalPercent}
                />
              )}
              {foodOn && (
                <DiscountKindFields
                  label="Discount on food"
                  hint={foodSubtotalCap != null ? `Food $${foodSubtotalCap.toFixed(2)}` : 'Food subtotal'}
                  amount={discountFood}
                  percent={discountFoodPercent}
                  base={foodBase}
                  onAmount={setDiscountFood}
                  onPercent={setDiscountFoodPercent}
                />
              )}
              {drinkOn && (
                <DiscountKindFields
                  label="Discount on drink"
                  hint={drinkSubtotalCap != null ? `Drink $${drinkSubtotalCap.toFixed(2)}` : 'Drink subtotal'}
                  amount={discountDrink}
                  percent={discountDrinkPercent}
                  base={drinkBase}
                  onAmount={setDiscountDrink}
                  onPercent={setDiscountDrinkPercent}
                />
              )}
              {itemsOn && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Discount by item</label>
                    {itemsDiscountSum > 0 ? (
                      <span className="text-[10px] text-emerald-400">−${itemsDiscountSum.toFixed(2)}</span>
                    ) : null}
                  </div>
                  {discountableItems.length === 0 ? (
                    <p className="text-[10px] text-rose-400">No items on this check to discount</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-0.5">
                      {itemDiscountRows.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-border bg-muted/10 p-2.5 space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-foreground font-medium truncate">
                              {row.qty}× {row.name}
                            </p>
                            <span className="text-[10px] text-muted-foreground text-tabular shrink-0">
                              ${row.lineTotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={row.draft.amount}
                              onChange={(e) => setItemDiscountField(row.id, 'amount', e.target.value)}
                              placeholder="Amount $"
                              aria-label={`Discount amount for ${row.name}`}
                              className="w-full bg-input border border-border rounded-lg px-2.5 py-2 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                            />
                            <div className="relative">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={100}
                                step="0.01"
                                value={row.draft.percent}
                                onChange={(e) => setItemDiscountField(row.id, 'percent', e.target.value)}
                                placeholder="Percent"
                                aria-label={`Discount percent for ${row.name}`}
                                className="w-full bg-input border border-border rounded-lg pl-2.5 pr-7 py-2 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                          {row.lineDiscount > 0 ? (
                            <p className="text-[10px] text-emerald-400">
                              −${row.lineDiscount.toFixed(2)}
                              {row.pct > 0 ? ` (${row.pct}% = $${row.fromPercent.toFixed(2)})` : ''}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mb-4 md:mb-5">
              <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Tip (optional)</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={tip}
                onChange={(e) => setTip(e.target.value)}
                placeholder="0.00"
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="mb-2">
              <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Payment method</label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Tap one, or tap several. Enter the amount on each method. Cash also has what the guest handed you.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5 md:gap-2 mb-3">
              {methods.map(m => {
                const on = selectedMethods.includes(m.id);
                return (
                <button
                  key={`pay-method-${m.id}`}
                  type="button"
                  onClick={() => toggleMethod(m.id)}
                  className={`flex flex-col items-center gap-1 md:gap-1.5 py-2.5 md:py-3 rounded-xl border text-xs font-medium transition-all duration-150 ${
                    on
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  {m.icon}
                  <span className="hidden sm:inline">{m.label}</span>
                  <span className="sm:hidden text-[9px]">{m.id === 'room' ? 'Room' : m.label}</span>
                </button>
                );
              })}
            </div>
            {mixedTender ? (
              <p className={`text-[11px] mb-3 font-medium ${Math.abs(tenderRemaining) > 0.02 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {tenderParts.map((t) => `${t.method} $${t.amount.toFixed(2)}`).join(' + ')}
                {Math.abs(tenderRemaining) > 0.02
                  ? ` · still need $${Math.abs(tenderRemaining).toFixed(2)}`
                  : ' · ready to post'}
              </p>
            ) : null}

            {selectedMethods.includes('cash') && (
              <div className="mb-4 md:mb-5 space-y-2 fade-in">
                {mixedTender && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">
                      Cash amount on the bill
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amountFieldValue('cash')}
                        onChange={(e) => setTenderAmounts((prev) => ({ ...prev, cash: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm font-semibold text-tabular focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
                <label className="text-xs text-muted-foreground block font-medium">
                  Guest handed you{cashPortion > 0 ? ` (cash on bill $${cashPortion.toFixed(2)})` : ''}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={cashPortion > 0 ? cashPortion.toFixed(2) : '0.00'}
                    className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm font-semibold text-tabular focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                {cashChange > 0 ? (
                  <p className="text-sm font-semibold text-amber-400 text-tabular">
                    Give the guest ${cashChange.toFixed(2)}
                    <span className="block text-xs font-semibold">អាប់ {formatChangeRiel(cashChange)}</span>
                  </p>
                ) : cashChange < -0.009 ? (
                  <p className="text-xs text-rose-400">
                    {mixedTender
                      ? 'Cash handed over is less than the cash amount on the bill'
                      : 'That does not cover the bill. Tap Card and enter the rest.'}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">Enter what the guest handed over (e.g. 200.00)</p>
                )}
              </div>
            )}

            {selectedMethods.includes('card') && (
              <div className="mb-4 md:mb-5 space-y-3 fade-in">
                {mixedTender && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">
                      Card amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amountFieldValue('card')}
                        onChange={(e) => setTenderAmounts((prev) => ({ ...prev, card: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm font-semibold text-tabular focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Card brand</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CARD_BRANDS.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setCardName(brand)}
                        className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          cardName === brand
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5 font-medium">
                    Transaction number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="Terminal / approval reference"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            )}

            {selectedMethods.includes('room') && (
              <div className="mb-4 md:mb-5 fade-in space-y-3">
                {mixedTender && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Room amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amountFieldValue('room')}
                        onChange={(e) => setTenderAmounts((prev) => ({ ...prev, room: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm font-semibold text-tabular focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
                <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Room Number</label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={e => setRoomNumber(e.target.value)}
                  placeholder="e.g. 412"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}

            {selectedMethods.includes('qr') && (
              <div className="mb-4 md:mb-5 fade-in flex flex-col items-center gap-3">
                {mixedTender && (
                  <div className="w-full">
                    <label className="text-xs text-muted-foreground block mb-1.5 font-medium">QR amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amountFieldValue('qr')}
                        onChange={(e) => setTenderAmounts((prev) => ({ ...prev, qr: e.target.value }))}
                        placeholder="0.00"
                        className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm font-semibold text-tabular focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
                <div className="w-28 md:w-32 h-28 md:h-32 bg-white rounded-xl flex items-center justify-center">
                  <QrCode size={72} className="text-gray-900" />
                </div>
                <p className="text-xs text-muted-foreground">Scan with payment app</p>
              </div>
            )}

            <button
              onClick={handleProcess}
              disabled={
                processing
                || !cardReady
                || (selectedMethods.includes('room') && !roomNumber.trim())
                || (selectedMethods.includes('cash') && cashChange < -0.009)
              }
              className="w-full btn-primary rounded-xl py-3 md:py-3.5 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                <>Confirm Payment <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
