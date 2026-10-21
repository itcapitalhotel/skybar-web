'use client';

import React, { useState } from 'react';
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
  const [cashTendered, setCashTendered] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const change = method === 'cash' ? Math.max(0, parseFloat(cashTendered || '0') - total) : 0;

  const handleProcess = async () => {
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
        subtotal: resolvedSubtotal,
        serviceCharge: resolvedService,
        vat: resolvedVat,
        total,
        foodSubtotal,
        drinkSubtotal,
        cashTendered: method === 'cash' ? parseFloat(cashTendered || '0') : null,
        roomNumber: method === 'room' ? roomNumber : null,
        discount: 0,
        staffId,
        cashierId: staffId,
      });

      setSuccess(true);
      setTimeout(() => {
        toast.success(`Payment of $${total.toFixed(2)} processed via ${method.toUpperCase()}`, { duration: 3000 });
        if (result.receiptPrinted === false) {
          toast.warning(
            result.receiptPrintMessage?.trim()
              || 'Receipt did not print — check Receipt Printer IP/port in Admin Config.',
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
            <p className="text-muted-foreground text-sm">${total.toFixed(2)} — {tableId}</p>
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
              <p className="text-3xl md:text-4xl font-bold text-primary text-tabular">${total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Amount Due</p>
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

            {method === 'cash' && (
              <div className="mb-4 md:mb-5 space-y-3 fade-in">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5 font-medium">Cash Tendered</label>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={e => setCashTendered(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                {parseFloat(cashTendered) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Change Due</span>
                    <span className="text-emerald-400 font-semibold text-tabular">${change.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {[total, Math.ceil(total / 10) * 10 + 10, Math.ceil(total / 20) * 20 + 20].map((amt, i) => (
                    <button
                      key={`cash-preset-${i}`}
                      onClick={() => setCashTendered(amt.toFixed(2))}
                      className="flex-1 py-1.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                    >
                      ${amt.toFixed(0)}
                    </button>
                  ))}
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
              disabled={processing || (method === 'cash' && parseFloat(cashTendered || '0') < total)}
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
