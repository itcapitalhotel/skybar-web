'use client';

import React, { useRef, useState } from 'react';
import { ArrowLeftRight, Trash2, SplitSquareHorizontal, CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Users, FileText, Minus, Plus, X, Printer } from 'lucide-react';
import { TableData, OrderItem, calcOrderTotal } from './floorData';
import type { UserRole } from '@/lib/api/types';
import { receiptsApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';
import { toast } from 'sonner';

interface OrderPanelProps {
  table: TableData | null;
  items: OrderItem[];
  role: UserRole;
  onVoidItem: (itemId: string, reason: string) => void | Promise<void>;
  onIncreaseItem?: (item: OrderItem, qty: number) => void | Promise<void>;
  onDecreaseItem?: (itemId: string, qty: number, reason: string) => void | Promise<void>;
  onUpdateNote?: (itemId: string, qty: number, notes: string) => void | Promise<void>;
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
  onIncreaseItem,
  onDecreaseItem,
  onUpdateNote,
  onOpenSplit,
  onOpenTransfer,
  onOpenPayment,
  onRequestManagerPin,
  onClearTable,
}: OrderPanelProps) {
  const [voidTarget, setVoidTarget] = useState<OrderItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [increaseTarget, setIncreaseTarget] = useState<OrderItem | null>(null);
  const [increaseQty, setIncreaseQty] = useState('1');
  const [increaseSaving, setIncreaseSaving] = useState(false);
  const [decreaseTarget, setDecreaseTarget] = useState<OrderItem | null>(null);
  const [decreaseQty, setDecreaseQty] = useState('1');
  const [decreaseReason, setDecreaseReason] = useState('');
  const [decreaseSaving, setDecreaseSaving] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [printingBill, setPrintingBill] = useState(false);

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
  const total = subtotal + serviceCharge + vat;
  const minSpendGap = table.minSpend ? Math.max(0, table.minSpend - subtotal) : 0;

  const canSplit = role === 'Admin' || role === 'Manager' || role === 'Supervisor' || role === 'Service' || role === 'Cashier';
  const canPay = role === 'Admin' || role === 'Manager' || role === 'Supervisor' || role === 'Service' || role === 'Cashier';

  const closeVoidModal = () => {
    if (voiding) return;
    setVoidTarget(null);
    setVoidReason('');
  };

  const runVoid = async (itemId: string, reason: string, withManagerApproval: boolean) => {
    setVoiding(true);
    try {
      await onVoidItem(itemId, reason);
      toast.success(withManagerApproval ? 'Item removed (manager approved)' : 'Item removed');
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove item');
    } finally {
      setVoiding(false);
    }
  };

  const submitVoid = () => {
    if (!voidTarget || voiding) return;
    const reason = voidReason.trim();
    if (!reason) return;
    const itemId = voidTarget.id;
    if (role === 'Bartender') {
      onRequestManagerPin('Void Item', () => {
        void runVoid(itemId, reason, true);
      });
      return;
    }
    void runVoid(itemId, reason, false);
  };

  const closeIncreaseModal = () => {
    if (increaseSaving) return;
    setIncreaseTarget(null);
    setIncreaseQty('1');
  };

  const submitIncrease = async () => {
    if (!increaseTarget || increaseSaving || !onIncreaseItem) return;
    const qty = Number(increaseQty);
    if (!Number.isInteger(qty) || qty < 1) {
      toast.error('Enter a quantity of at least 1');
      return;
    }
    setIncreaseSaving(true);
    try {
      await onIncreaseItem(increaseTarget, qty);
      setIncreaseTarget(null);
      setIncreaseQty('1');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the extra quantity');
    } finally {
      setIncreaseSaving(false);
    }
  };

  const closeDecreaseModal = () => {
    if (decreaseSaving) return;
    setDecreaseTarget(null);
    setDecreaseQty('1');
    setDecreaseReason('');
  };

  const runDecrease = async (itemId: string, qty: number, reason: string) => {
    if (!onDecreaseItem) return;
    setDecreaseSaving(true);
    try {
      await onDecreaseItem(itemId, qty, reason);
      toast.success(`Decreased by ${qty}`);
      setDecreaseTarget(null);
      setDecreaseQty('1');
      setDecreaseReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decrease the quantity');
    } finally {
      setDecreaseSaving(false);
    }
  };

  const submitDecrease = () => {
    if (!decreaseTarget || decreaseSaving || !onDecreaseItem) return;
    const qty = Number(decreaseQty);
    const reason = decreaseReason.trim();
    if (!Number.isInteger(qty) || qty < 1 || qty > decreaseTarget.qty) {
      toast.error(`Enter a quantity from 1 to ${decreaseTarget.qty}`);
      return;
    }
    if (!reason) return;
    const itemId = decreaseTarget.id;
    if (role === 'Bartender') {
      onRequestManagerPin('Decrease quantity', () => {
        void runDecrease(itemId, qty, reason);
      });
      return;
    }
    void runDecrease(itemId, qty, reason);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
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
            {activeItems.length === 0 ? (
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
            ) : null}
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

      {/* Items List — scrolls so totals / Pay Now stay visible */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin px-3 py-2 space-y-1.5">
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
                  <p className="text-xs font-medium text-foreground leading-snug break-words">
                    {item.status === 'Voided' || !onIncreaseItem ? (
                      <span className="font-semibold text-muted-foreground text-tabular">{item.qty}x </span>
                    ) : null}
                    {item.name}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
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
                  {item.status !== 'Voided' && onUpdateNote ? (
                    <NoteField
                      itemId={item.id}
                      saved={item.notes ?? ''}
                      draft={noteDrafts[item.id]}
                      saving={savingNoteId === item.id}
                      onDraft={(value) => setNoteDrafts((prev) => ({ ...prev, [item.id]: value }))}
                      onSave={async (value) => {
                        const next = value.trim();
                        if (next === (item.notes ?? '').trim()) return;
                        setSavingNoteId(item.id);
                        try {
                          await onUpdateNote(item.id, item.qty, next);
                          setNoteDrafts((prev) => {
                            const copy = { ...prev };
                            delete copy[item.id];
                            return copy;
                          });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Could not save the note');
                        } finally {
                          setSavingNoteId(null);
                        }
                      }}
                    />
                  ) : item.notes ? (
                    <p className="text-[10px] text-amber-400/80 mt-0.5 italic">Note: {item.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.status !== 'Voided' && onIncreaseItem && onDecreaseItem ? (
                    <div className="flex items-center rounded-lg border border-border overflow-hidden">
                      <button
                        type="button"
                        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        onClick={() => {
                          setDecreaseTarget(item);
                          setDecreaseQty('1');
                          setDecreaseReason('');
                        }}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-5 text-center text-[11px] font-semibold tabular-nums">{item.qty}</span>
                      <button
                        type="button"
                        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        onClick={() => {
                          setIncreaseTarget(item);
                          setIncreaseQty('1');
                        }}
                        aria-label="Increase quantity"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  ) : null}
                  <span className="text-xs font-semibold text-foreground text-tabular">${(item.unitPrice * item.qty).toFixed(0)}</span>
                  {item.status !== 'Voided' && (
                    <button
                      onClick={() => {
                        setVoidTarget(item);
                        setVoidReason('');
                      }}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Remove item"
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

      {/* Totals + Pay Now — pinned footer (always visible on iPad) */}
      <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-2.5 space-y-1">
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
          <div className="flex justify-between text-sm font-bold text-foreground pt-1.5 border-t border-border">
            <span>Total</span>
            <span className="text-tabular text-primary">${total.toFixed(2)}</span>
          </div>
        </div>

        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="grid grid-cols-1 gap-1.5">
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

          <button
            type="button"
            disabled={activeItems.length === 0 || printingBill}
            onClick={async () => {
              if (!table?.id || printingBill) return;
              setPrintingBill(true);
              try {
                const staffId = getAuthUser()?.id ?? undefined;
                const result = await receiptsApi.print({
                  tableId: table.id,
                  staffId: staffId ?? null,
                });
                if (result.receiptPrinted) {
                  toast.success('Bill check printed');
                } else {
                  toast.error(result.receiptPrintMessage || 'Bill check sent but printer did not confirm');
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to print bill check');
              } finally {
                setPrintingBill(false);
              }
            }}
            className="w-full rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-amber-400 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 hover:border-amber-500/40 transition-all"
          >
            <Printer size={16} />
            {printingBill ? 'Printing…' : 'BILL CHECKED'}
          </button>

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

      {increaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={closeIncreaseModal} />
          <form
            className="relative w-full max-w-sm glass-card-elevated rounded-2xl border border-border p-5 fade-in"
            onSubmit={(e) => {
              e.preventDefault();
              void submitIncrease();
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Add quantity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {increaseTarget.name}{increaseTarget.size ? ` · ${increaseTarget.size}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeIncreaseModal}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="increase-qty">
              Quantity to send
            </label>
            <input
              id="increase-qty"
              autoFocus
              inputMode="numeric"
              value={increaseQty}
              onChange={(e) => setIncreaseQty(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="field-input w-full tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              This quantity prints to the kitchen.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={closeIncreaseModal}
                disabled={increaseSaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={increaseSaving || !increaseQty || Number(increaseQty) < 1}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-40"
              >
                {increaseSaving ? 'Confirming…' : 'CONFIRM'}
              </button>
            </div>
          </form>
        </div>
      )}

      {decreaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={closeDecreaseModal} />
          <form
            className="relative w-full max-w-sm glass-card-elevated rounded-2xl border border-border p-5 fade-in"
            onSubmit={(e) => {
              e.preventDefault();
              submitDecrease();
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Decrease quantity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {decreaseTarget.qty}× {decreaseTarget.name}{decreaseTarget.size ? ` · ${decreaseTarget.size}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDecreaseModal}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="decrease-qty">
              Quantity to remove
            </label>
            <input
              id="decrease-qty"
              autoFocus
              inputMode="numeric"
              value={decreaseQty}
              onChange={(e) => setDecreaseQty(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="field-input w-full tabular-nums"
            />
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 mt-3" htmlFor="decrease-reason">
              Reason
            </label>
            <textarea
              id="decrease-reason"
              rows={3}
              value={decreaseReason}
              onChange={(e) => setDecreaseReason(e.target.value)}
              placeholder="Why is this quantity being removed?"
              className="field-input w-full resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Guest changed mind', 'Wrong item', 'Item cancelled by guest'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDecreaseReason(preset)}
                  className="px-2 py-1 rounded-lg border border-border bg-muted/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={closeDecreaseModal}
                disabled={decreaseSaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={decreaseSaving || !decreaseReason.trim() || !decreaseQty || Number(decreaseQty) < 1}
                className="flex-1 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 disabled:opacity-40"
              >
                {decreaseSaving ? 'Saving…' : 'Decrease'}
              </button>
            </div>
          </form>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-overlay absolute inset-0" onClick={closeVoidModal} />
          <form
            className="relative w-full max-w-sm glass-card-elevated rounded-2xl border border-border p-5 fade-in"
            onSubmit={(e) => {
              e.preventDefault();
              submitVoid();
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Remove item</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {voidTarget.qty}× {voidTarget.name}{voidTarget.size ? ` · ${voidTarget.size}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeVoidModal}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="void-reason">
              Reason
            </label>
            <textarea
              id="void-reason"
              autoFocus
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Why is this item being removed?"
              className="field-input w-full resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Guest changed mind', 'Wrong item', 'Item cancelled by guest'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setVoidReason(preset)}
                  className="px-2 py-1 rounded-lg border border-border bg-muted/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={closeVoidModal}
                disabled={voiding}
                className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={voiding || !voidReason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 disabled:opacity-40"
              >
                {voiding ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NoteField({
  itemId,
  saved,
  draft,
  saving,
  onDraft,
  onSave,
}: {
  itemId: string;
  saved: string;
  draft?: string;
  saving: boolean;
  onDraft: (value: string) => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const value = draft ?? saved;
  const latest = useRef(value);
  latest.current = value;
  return (
    <input
      type="text"
      value={value}
      disabled={saving}
      aria-label={`Note for item ${itemId}`}
      placeholder="Add a note"
      onChange={(e) => {
        latest.current = e.target.value;
        onDraft(e.target.value);
      }}
      onBlur={() => { void onSave(latest.current); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="mt-1 w-full rounded-md border border-border bg-muted/30 px-1.5 py-1 text-[10px] text-amber-200 placeholder:text-muted-foreground/70 placeholder:not-italic focus:outline-none focus:border-amber-400/40 disabled:opacity-60"
    />
  );
}