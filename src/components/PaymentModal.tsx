'use client';

import React, { useEffect, useState } from 'react';
import { X, CreditCard, Banknote, QrCode, BedDouble, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { menuApi, menuCategoryApi, paymentsApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';
import type { PaymentMethod } from '@/lib/api/types';
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
] as const;
type DiscountKind = (typeof DISCOUNT_KINDS)[number]['id'];

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
  const [method, setMethod] = useState<PayMethod>('card');
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
  const [foodSubtotalCap, setFoodSubtotalCap] = useState<number | null>(null);
  const [drinkSubtotalCap, setDrinkSubtotalCap] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMethod('card');
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
  const discountSum = Math.round((
    billDiscount + foodDiscount + drinkDiscount
    + billPercentAmount + foodPercentAmount + drinkPercentAmount
  ) * 100) / 100;
  const amountDue = Math.max(0, Math.round((total - discountSum) * 100) / 100);

  const toggleDiscountKind = (kind: DiscountKind) => {
    setDiscountKinds((prev) => (
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    ));
  };
  const cardReady =
    method !== 'card'
    || (Boolean(cardName) && cardNumber.trim().length > 0);

  const handleProcess = async () => {
    if (method === 'card' && !cardNumber.trim()) {
      toast.error('Enter the card transaction number');
      return;
    }
    if (method === 'room' && !roomNumber.trim()) {
      toast.error('Enter a room number');
      return;
    }
    if (billPercent > 100 || foodPercent > 100 || drinkPercent > 100) {
      toast.error('Discount percent cannot be more than 100');
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
      const resolvedSubtotal = subtotal ?? total / 1.21;
      const resolvedService = serviceCharge ?? resolvedSubtotal * 0.1;
      const resolvedVat = vat ?? (resolvedSubtotal + resolvedService) * 0.07;

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

      const result = await paymentsApi.process({
        tableId,
        guestCount: Math.max(1, guestCount),
        method,
        cardName: method === 'card' ? cardName : null,
        cardNumber: method === 'card' ? cardNumber.trim() : null,
        subtotal: resolvedSubtotal,
        serviceCharge: resolvedService,
        vat: resolvedVat,
        total,
        foodSubtotal,
        drinkSubtotal,
        cashTendered: null,
        roomNumber: method === 'room' ? roomNumber.trim() : null,
        tip: tipAmount > 0 ? tipAmount : 0,
        discountTotal: billDiscount,
        discountFood: foodDiscount,
        discountDrink: drinkDiscount,
        discountTotalPercent: billPercent,
        discountFoodPercent: foodPercent,
        discountDrinkPercent: drinkPercent,
        staffId,
        cashierId: staffId,
      });

      setSuccess(true);
      setTimeout(() => {
        const methodLabel =
          method === 'card' ? `${cardName.toUpperCase()} CARD` : method.toUpperCase();
        toast.success(`Payment of $${amountDue.toFixed(2)} processed via ${methodLabel}`, { duration: 3000 });
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
            </div>

            <div className="mb-4 md:mb-5 space-y-2">
              <label className="text-xs text-muted-foreground block font-medium">Discount</label>
              <div className="grid grid-cols-3 gap-1.5">
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

            <div className="grid grid-cols-4 gap-1.5 md:gap-2 mb-4 md:mb-5">
              {methods.map(m => (
                <button
                  key={`pay-method-${m.id}`}
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center gap-1 md:gap-1.5 py-2.5 md:py-3 rounded-xl border text-xs font-medium transition-all duration-150 ${
                    method === m.id
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  {m.icon}
                  <span className="hidden sm:inline">{m.label}</span>
                  <span className="sm:hidden text-[9px]">{m.id === 'room' ? 'Room' : m.label}</span>
                </button>
              ))}
            </div>

            {method === 'card' && (
              <div className="mb-4 md:mb-5 space-y-3 fade-in">
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

            {method === 'room' && (
              <div className="mb-4 md:mb-5 fade-in">
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

            {method === 'qr' && (
              <div className="mb-4 md:mb-5 fade-in flex flex-col items-center gap-3">
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
                || (method === 'room' && !roomNumber.trim())
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
