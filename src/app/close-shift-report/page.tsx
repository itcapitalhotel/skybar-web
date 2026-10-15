'use client';

import React, { useState, useEffect, useRef } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import { DollarSign, CreditCard, QrCode, BedDouble, Receipt, Users, TrendingUp, AlertCircle, Printer, CheckCircle2, Clock, Hash, Percent, ShieldCheck, BarChart3,  } from 'lucide-react';
import {
  EMPTY_SHIFT,
  fetchCurrentShift, fetchRecentTransactions, fetchHourlyRevenue,
  type ShiftSummary, type RecentTransaction, type HourlyRevenue,
} from '@/app/shift-cash-split-bill/components/shiftData';

const METHOD_COLORS: Record<string, string> = {
  Cash: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25',
  Card: 'text-primary bg-primary/15 border-primary/25',
  QR: 'text-amber-400 bg-amber-500/15 border-amber-500/25',
  Room: 'text-purple-400 bg-purple-500/15 border-purple-500/25',
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
  Cash: <DollarSign size={13} />,
  Card: <CreditCard size={13} />,
  QR: <QrCode size={13} />,
  Room: <BedDouble size={13} />,
};

export default function CloseShiftReportPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [shift, setShift] = useState<ShiftSummary>(EMPTY_SHIFT);
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [hourly, setHourly] = useState<HourlyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [closedAt] = useState(() => new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCurrentShift(), fetchRecentTransactions(), fetchHourlyRevenue()])
      .then(([s, t, h]) => {
        if (!cancelled) {
          setShift(s);
          setTransactions(t);
          setHourly(h);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const hasOpenShift = Boolean(shift.shiftId);
  const totalRevenue = shift.cashSales + shift.cardSales + shift.qrSales + shift.roomChargeSales;
  const netRevenue = totalRevenue - shift.discounts;
  const txnCount = shift.transactions ?? transactions.length;
  const avgOrderValue = txnCount > 0 ? netRevenue / txnCount : 0;
  const hourTotal = (h: HourlyRevenue) =>
    h.revenue ?? (h.cash ?? 0) + (h.card ?? 0) + (h.qr ?? 0);
  const peakHour = hourly.length
    ? hourly.reduce((a, b) => (hourTotal(b) > hourTotal(a) ? b : a), hourly[0])
    : null;

  const paymentBreakdown = [
    { label: 'Cash', value: shift.cashSales, pct: totalRevenue > 0 ? (shift.cashSales / totalRevenue) * 100 : 0, method: 'Cash' },
    { label: 'Card', value: shift.cardSales, pct: totalRevenue > 0 ? (shift.cardSales / totalRevenue) * 100 : 0, method: 'Card' },
    { label: 'QR / Mobile', value: shift.qrSales, pct: totalRevenue > 0 ? (shift.qrSales / totalRevenue) * 100 : 0, method: 'QR' },
    { label: 'Room Charge', value: shift.roomChargeSales, pct: totalRevenue > 0 ? (shift.roomChargeSales / totalRevenue) * 100 : 0, method: 'Room' },
  ];

  const handlePrint = () => {
    window.print();
  };

  if (locked) {
    return (
      <LockModal
        isOpen={lockOpen}
        onClose={() => { setLockOpen(false); setLocked(false); }}
        onUnlock={() => { setLockOpen(false); setLocked(false); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => { setLockOpen(true); setLocked(true); }} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => { setLockOpen(false); setLocked(false); }} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 print:px-0 print:py-0 print:max-w-none" ref={printRef}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck size={22} className="text-primary" />
              Close Shift Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shift <span className="text-foreground font-medium">{shift.shiftId}</span> · Opened {shift.openedAt} · Cashier: {shift.cashier} · Terminal: {shift.terminal}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/60 border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
            >
              <Printer size={15} />
              Print Report
            </button>
            {!closeConfirmed ? (
              <button
                onClick={() => setCloseConfirmed(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 text-sm font-semibold transition-all"
              >
                <ShieldCheck size={15} />
                Close Shift
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
                <CheckCircle2 size={15} />
                Shift Closed
              </div>
            )}
          </div>
        </div>

        {/* Print Header (only visible when printing) */}
        <div className="hidden print:block mb-4">
          <div className="text-center border-b border-border pb-3 mb-3">
            <h1 className="text-xl font-bold">SkyBar Rooftop Lounge — Close Shift Report</h1>
            <p className="text-sm text-muted-foreground">Shift: {shift.shiftId} · Cashier: {shift.cashier} · Terminal: {shift.terminal}</p>
            <p className="text-sm text-muted-foreground">Opened: {shift.openedAt} · Closed: {closedAt}</p>
          </div>
        </div>

        {/* No open shift */}
        {!loading && !hasOpenShift && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <AlertCircle size={18} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">No open shift</p>
              <p className="text-xs text-muted-foreground">
                Open a shift to see live close-shift data here (shift summary lives on Close Shift Report).
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="glass-card rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
            Loading shift data…
          </div>
        )}

        {!loading && hasOpenShift && (
          <>
        {closeConfirmed && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 print:hidden">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Shift successfully closed at {closedAt}</p>
              <p className="text-xs text-muted-foreground">All data has been recorded. This report is ready to print or archive.</p>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Gross Revenue', value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <TrendingUp size={16} />, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            { label: 'Net Revenue', value: `$${netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <DollarSign size={16} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Total Orders', value: txnCount.toString(), icon: <Receipt size={16} />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Covers Served', value: shift.covers.toString(), icon: <Users size={16} />, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          ].map(kpi => (
            <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.bg}`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium mb-2 ${kpi.color}`}>
                {kpi.icon}
                {kpi.label}
              </div>
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Two-column: Payment Breakdown + Shift Details */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Payment Breakdown */}
          <div className="glass-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 size={15} className="text-primary" />
              Payment Method Breakdown
            </h2>
            <div className="space-y-3">
              {paymentBreakdown.map(p => (
                <div key={p.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${METHOD_COLORS[p.method]}`}>
                      {METHOD_ICONS[p.method]}
                      {p.label}
                    </span>
                    <span className="text-foreground font-semibold">${p.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        p.method === 'Cash' ? 'bg-emerald-500' :
                        p.method === 'Card' ? 'bg-primary' :
                        p.method === 'QR' ? 'bg-amber-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground">{p.pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-sm">
              <span className="text-muted-foreground">Total Collected</span>
              <span className="font-bold text-foreground">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Shift Details */}
          <div className="glass-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock size={15} className="text-primary" />
              Shift Details
            </h2>
            <div className="space-y-2.5">
              {[
                { label: 'Opening Float', value: `$${shift.openingFloat.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <DollarSign size={13} /> },
                { label: 'Total Discounts', value: `-$${shift.discounts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <Percent size={13} />, valueClass: 'text-rose-400' },
                { label: 'Void Count', value: `${shift.voids} voids`, icon: <AlertCircle size={13} />, valueClass: 'text-amber-400' },
                { label: 'Avg Order Value', value: `$${avgOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <TrendingUp size={13} /> },
                { label: 'Peak Hour', value: peakHour ? peakHour.hour : '—', icon: <BarChart3 size={13} /> },
                { label: 'Total Transactions', value: shift.transactions.toString(), icon: <Hash size={13} /> },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {row.icon}
                    {row.label}
                  </span>
                  <span className={`text-sm font-semibold ${row.valueClass || 'text-foreground'}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hourly Revenue Table */}
        <div className="glass-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            Hourly Revenue Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Hour</th>
                  <th className="text-right py-2 px-3 text-emerald-400 font-medium">Cash</th>
                  <th className="text-right py-2 px-3 text-primary font-medium">Card</th>
                  <th className="text-right py-2 px-3 text-amber-400 font-medium">QR</th>
                  <th className="text-right py-2 pl-3 text-foreground font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {hourly.map(h => {
                  const rowTotal = h.cash + h.card + h.qr;
                  return (
                    <tr key={h.hour} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="py-2 pr-4 font-medium text-foreground">{h.hour}</td>
                      <td className="text-right py-2 px-3 text-emerald-400">${h.cash}</td>
                      <td className="text-right py-2 px-3 text-primary">${h.card}</td>
                      <td className="text-right py-2 px-3 text-amber-400">${h.qr}</td>
                      <td className="text-right py-2 pl-3 font-semibold text-foreground">${rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2 pr-4 font-bold text-foreground text-xs">Total</td>
                  <td className="text-right py-2 px-3 font-bold text-emerald-400">${shift.cashSales}</td>
                  <td className="text-right py-2 px-3 font-bold text-primary">${shift.cardSales}</td>
                  <td className="text-right py-2 px-3 font-bold text-amber-400">${shift.qrSales}</td>
                  <td className="text-right py-2 pl-3 font-bold text-foreground">${totalRevenue}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="glass-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Receipt size={15} className="text-primary" />
            Transactions This Shift
            <span className="ml-auto text-xs text-muted-foreground font-normal">{transactions.length} records</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-muted-foreground font-medium">ID</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Table</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Staff</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Method</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Time</th>
                  <th className="text-right py-2 pl-3 text-muted-foreground font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(txn => (
                  <tr key={txn.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-2 pr-3 text-muted-foreground font-mono">{txn.id}</td>
                    <td className="py-2 px-3 font-medium text-foreground">{txn.tableLabel}</td>
                    <td className="py-2 px-3 text-muted-foreground">{txn.staff}</td>
                    <td className="py-2 px-3">
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium w-fit ${METHOD_COLORS[txn.method]}`}>
                        {METHOD_ICONS[txn.method]}
                        {txn.method}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{txn.time}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-foreground">${txn.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer summary for print */}
        <div className="hidden print:block mt-4 pt-3 border-t border-border text-center text-xs text-muted-foreground">
          <p>Generated: {closedAt} · SkyBar POS System · {shift.terminal}</p>
        </div>
          </>
        )}

      </main>

      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { background: white; color: black; }
          .glass-card { background: white; border: 1px solid #ddd; }
        }
      `}</style>
    </div>
  );
}
