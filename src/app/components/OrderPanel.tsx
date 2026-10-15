'use client';

import React, { useState } from 'react';
import { ArrowLeftRight, Trash2, Tag, SplitSquareHorizontal, CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Users, FileText } from 'lucide-react';
import { TableData, OrderItem, calcOrderTotal } from './floorData';
import type { UserRole } from '@/lib/api/types';
import { toast } from 'sonner';

interface OrderPanelProps {
  table: TableData | null;
  items: OrderItem[];
  role: UserRole;
  onVoidItem: (itemId: string) => void | Promise<void>;
  onOpenSplit: () => void;
  onOpenTransfer: () => void;
  onOpenPayment: () => void;
  onRequestManagerPin: (action: string, onApprove: () => void) => void;
  onClearTable: () => void | Promise<void>;
}

const DEFAULT_ITEM_STATUS = {
  label: 'Unknown',
  color: 'text-muted-foreground bg-muted/40 border-border',
  icon: <Clock size={10} />,
} as const;

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  Queued: { label: 'Queued', color: 'text-amber-400 bg-amber-500/15 border-amber-500/25', icon: <Clock size={10} /> },
  'In Prep': { label: 'In Prep', color: 'text-orange-400 bg-orange-500/15 border-orange-500/25', icon: <Clock size={10} /> },
  Ready: { label: 'Ready', color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25', icon: <CheckCircle2 size={10} /> },
  Served: { label: 'Served', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25', icon: <CheckCircle2 size={10} /> },
  Voided: { label: 'Voided', color: 'text-rose-400 bg-rose-500/15 border-rose-500/25', icon: <XCircle size={10} /> },
};

function itemStatusConfig(status: string | undefined) {
  if (!status) return DEFAULT_ITEM_STATUS;
  return ITEM_STATUS_CONFIG[status] ?? { ...DEFAULT_ITEM_STATUS, label: status };
}

export default function OrderPanel({
  table,
  items,
  role,
  onVoidItem,
  onOpenSplit,
  onOpenTransfer,
  onOpenPayment,
  onRequestManagerPin,
  onClearTable,
}: OrderPanelProps) {
  const [discountPct, setDiscountPct] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);

  if (!table) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
        <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border flex items-center justify-center mb-4">
          <FileText size={22} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-2">No Table Selected</p>
        <p className="text-xs text-muted-foreground">Tap a table on the floor map to view its order and checkout</p>
      </div>
    );
  }

  const activeItems = items.filter(i => i.status !== 'Voided');
  const subtotal = calcOrderTotal(items);
  const serviceCharge = subtotal * 0.10;
  const vat = (subtotal + serviceCharge) * 0.10;
  const discountAmt = (subtotal + serviceCharge) * (discountPct / 100);
  const total = subtotal + serviceCharge + vat - discountAmt;
  const minSpendGap = table.minSpend ? Math.max(0, table.minSpend - subtotal) : 0;

  const canApplyDiscount = role === 'Admin' || role === 'Manager';
  const canSplit = role === 'Admin' || role === 'Manager' || role === 'Cashier';
  const canPay = role === 'Admin' || role === 'Manager' || role === 'Cashier';
  const runVoid = async (itemId: string, withManagerApproval: boolean) => {
    try {
      await onVoidItem(itemId);
      toast.success(withManagerApproval ? 'Item removed (manager approved)' : 'Item removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove item');
    }
  };

  const handleVoid = (itemId: string) => {
    if (role === 'Bartender') {
      onRequestManagerPin('Void Item', () => {
        void runVoid(itemId, true);
      });
    } else {
      void runVoid(itemId, false);
    }
  };

  const handleDiscount = (pct: number) => {
    if (!canApplyDiscount) {
      onRequestManagerPin(`Apply ${pct}% Discount`, () => {
        setDiscountPct(pct);
        setDiscountOpen(false);
        toast.success(`${pct}% discount applied`);
      });
    } else {
      setDiscountPct(pct);
      setDiscountOpen(false);
      toast.success(`${pct}% discount applied`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">{table.label}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1"><Users size={10} />{table.guests} Guests</span>
              <span>·</span>
              <span>Staff: {table.staff}</span>
            </div>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                const hasOpenCheck =
                  activeItems.length > 0 || table.status === 'occupied' || table.status === 'bill';
                if (!hasOpenCheck) {
                  toast.error('No open check on this table');
                  return;
                }
                if (role === 'Bartender') {
                  onRequestManagerPin('Change Table', onOpenTransfer);
                } else {
                  onOpenTransfer();
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all text-xs"
              title="Move check to another table"
            >
              <ArrowLeftRight size={11} />
              <span className="hidden xl:block">Change table</span>
            </button>
            <button
              onClick={() => {
                if (role === 'Bartender') {
                  onRequestManagerPin('Clear Table', () => { void onClearTable(); });
                } else {
                  void onClearTable();
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all text-xs"
            >
              <Trash2 size={11} />
              <span className="hidden xl:block">Clear</span>
            </button>
          </div>
        </div>

        {/* Min Spend Warning */}
        {minSpendGap > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle size={11} />
            <span>${minSpendGap.toFixed(0)} below ${table.minSpend} min spend</span>
          </div>
        )}
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5">
        {activeItems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">No items ordered yet</p>
          </div>
        ) : (
          activeItems.map(item => {
            const statusCfg = itemStatusConfig(item.status);
            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-2.5 rounded-xl transition-all ${
                  item.status === 'Voided' ? 'opacity-40' : 'hover:bg-muted/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground text-tabular">{item.qty}x</span>
                    <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                    {item.size ? (
                      <span className="text-[10px] font-medium text-primary/90 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md">
                        {item.size}
                      </span>
                    ) : null}
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCfg.color}`}>
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] text-amber-400/80 mt-0.5 italic">Note: {item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs font-semibold text-foreground text-tabular">${(item.unitPrice * item.qty).toFixed(0)}</span>
                  {item.status !== 'Voided' && (
                    <button
                      onClick={() => handleVoid(item.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Void Item"
                    >
                      <XCircle size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Financial Breakdown */}
      <div className="px-4 py-3 border-t border-border space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span className="text-tabular">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Service Charge (10%)</span>
          <span className="text-tabular">${serviceCharge.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>VAT (10%)</span>
          <span className="text-tabular">${vat.toFixed(2)}</span>
        </div>
        {discountPct > 0 && (
          <div className="flex justify-between text-xs text-emerald-400">
            <span>Discount ({discountPct}%)</span>
            <span className="text-tabular">−${discountAmt.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border">
          <span>Total</span>
          <span className="text-tabular text-primary">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-3 pb-4 pt-2 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="relative">
            <button
              onClick={() => setDiscountOpen(v => !v)}
              className="w-full flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-amber-500/40 transition-all text-[10px] font-medium"
            >
              <Tag size={14} />
              Discount
            </button>
            {discountOpen && (
              <div className="absolute bottom-full mb-1 left-0 w-36 glass-card-elevated rounded-xl border border-border shadow-2xl z-20 fade-in overflow-hidden">
                {[5, 10, 15, 20, 25].map(pct => (
                  <button
                    key={`disc-${pct}`}
                    onClick={() => handleDiscount(pct)}
                    className="w-full px-3 py-2 text-xs text-left text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex justify-between"
                  >
                    <span>{pct}% Off</span>
                    <span className="text-emerald-400">−${((subtotal + serviceCharge) * pct / 100).toFixed(0)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {canSplit && (
            <button
              onClick={onOpenSplit}
              disabled={activeItems.length === 0}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-cyan-500/40 transition-all text-[10px] font-medium disabled:opacity-40"
            >
              <SplitSquareHorizontal size={14} />
              Split
            </button>
          )}
        </div>

        {canPay && (
          <button
            onClick={onOpenPayment}
            disabled={activeItems.length === 0}
            className="w-full btn-primary rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed neon-cyan"
          >
            <CreditCard size={16} />
            Pay Now (${total.toFixed(2)})
          </button>
        )}
      </div>
    </div>
  );
}