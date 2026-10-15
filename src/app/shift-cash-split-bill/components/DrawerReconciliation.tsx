'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { DRAWER_DENOMINATIONS, DrawerCount, fetchCurrentShift } from './shiftData';
import { shiftApi } from '@/lib/api/client';
import { toast } from 'sonner';

export default function DrawerReconciliation() {
  const [counts, setCounts] = useState<DrawerCount[]>(DRAWER_DENOMINATIONS.map(d => ({ ...d })));
  const [submitted, setSubmitted] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [openingFloat, setOpeningFloat] = useState(0);
  const [cashSales, setCashSales] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCurrentShift()
      .then(shift => {
        setShiftId(shift.shiftId);
        setOpeningFloat(shift.openingFloat);
        setCashSales(shift.cashSales);
      })
      .catch(() => {});
  }, []);

  const actualCash = counts.reduce((acc, d) => acc + d.value * d.count, 0);
  const expectedCash = openingFloat + cashSales;
  const difference = actualCash - expectedCash;

  const updateCount = (denomination: string, count: number) => {
    setCounts(prev => prev.map(d => d.denomination === denomination ? { ...d, count: Math.max(0, count) } : d));
  };

  const handleSubmit = async () => {
    if (!shiftId) {
      toast.error('No active shift found');
      return;
    }
    setSubmitting(true);
    try {
      const denominations: Record<string, number> = {};
      counts.forEach(d => {
        const key = d.value >= 1 ? String(d.value) : 'coins';
        denominations[key] = (denominations[key] ?? 0) + d.count * (d.value >= 1 ? d.value : d.value);
      });
      await shiftApi.reconcileDrawer({
        shiftId,
        denominations,
        countedTotal: actualCash,
      });
      setSubmitted(true);
      toast.success('Drawer reconciliation submitted for review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-muted/30 border border-border text-center">
          <p className="text-xs text-muted-foreground mb-1">Opening Float</p>
          <p className="text-base font-bold text-foreground text-tabular">${openingFloat.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/30 border border-border text-center">
          <p className="text-xs text-muted-foreground mb-1">Expected in Drawer</p>
          <p className="text-base font-bold text-foreground text-tabular">${expectedCash.toFixed(2)}</p>
        </div>
        <div className={`p-3 rounded-xl border text-center ${
          difference === 0 ? 'bg-emerald-500/10 border-emerald-500/20' :
          difference > 0 ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-rose-500/10 border-rose-500/20'
        }`}>
          <p className="text-xs text-muted-foreground mb-1">Variance</p>
          <p className={`text-base font-bold text-tabular ${difference === 0 ? 'text-emerald-400' : difference > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
            {difference >= 0 ? '+' : ''}{difference.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground">Count Denominations</h4>
        </div>
        <div className="divide-y divide-border/50">
          {counts.map(d => (
            <div key={d.denomination} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground font-medium">{d.denomination}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => updateCount(d.denomination, d.count - 1)} className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:bg-muted/40">−</button>
                <input
                  type="number"
                  value={d.count}
                  onChange={e => updateCount(d.denomination, parseInt(e.target.value) || 0)}
                  className="w-16 text-center bg-input border border-border rounded-lg py-1.5 text-sm text-foreground"
                />
                <button onClick={() => updateCount(d.denomination, d.count + 1)} className="w-8 h-8 rounded-lg border border-border text-muted-foreground hover:bg-muted/40">+</button>
                <span className="text-sm text-muted-foreground text-tabular w-20 text-right">${(d.value * d.count).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border">
        <span className="text-sm font-medium text-foreground">Counted Total</span>
        <span className="text-xl font-bold text-primary text-tabular">${actualCash.toFixed(2)}</span>
      </div>

      {submitted ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-400">Reconciliation submitted successfully.</p>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full btn-primary rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Reconciliation'}
        </button>
      )}

      {difference !== 0 && !submitted && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${
          difference > 0 ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {difference > 0 ? <TrendingUp size={14} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />}
          <span>{difference > 0 ? 'Drawer is over — verify count before submitting.' : 'Drawer is short — recount or note discrepancy.'}</span>
        </div>
      )}
    </div>
  );
}
