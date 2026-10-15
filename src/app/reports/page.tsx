'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import {
  Printer, FileSpreadsheet, DollarSign, CreditCard, QrCode, BedDouble, Receipt, Users,
  TrendingUp, BarChart3, ArrowUpDown, RefreshCw, AlertCircle, Eye,
} from 'lucide-react';
import OrderDetailModal from '@/app/reports/OrderDetailModal';
import DateRangePicker, { todayRange } from '@/components/DateRangePicker';
import { analyticsApi } from '@/lib/api/client';
import {
  ensureStaffNameCache,
  finalizeStaffDisplay,
  isPlaceholderStaffLabel,
  pickStaffFields,
  registerStaffNames,
  resolveStaffDisplay,
} from '@/lib/staffDisplay';
import type { AnalyticsStaffPerformance, AnalyticsTransaction } from '@/lib/api/types';

interface StaffReportRow {
  name: string;
  role: string;
  revenue: number;
  orders: number;
  covers: number;
  avgOrderValue: number;
}

interface OrderReportRow {
  id: string;
  paymentId: string;
  orderId?: string;
  openedAt: string;
  closedAt: string;
  closedAtIso: string;
  tableLabel: string;
  staff: string;
  method: string;
  amount: number;
}

type SortKey = 'name' | 'revenue' | 'orders' | 'covers';
type OrderSortKey = 'closedAt' | 'openedAt' | 'tableLabel' | 'staff' | 'method' | 'amount';

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  if (!iso.includes('T') && !iso.includes('-')) return iso;
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function staffRow(s: AnalyticsStaffPerformance): StaffReportRow {
  const fields = pickStaffFields(s as unknown as Record<string, unknown>);
  const resolved = resolveStaffDisplay({
    staffName: fields.staffName,
    staffId: fields.staffId || s.staffId,
    staff: fields.staffId || s.staffId,
  });
  const name = finalizeStaffDisplay(resolved, fields.staffId || s.staffId);
  return {
    name,
    role: s.role,
    revenue: Number(s.revenue ?? 0),
    orders: s.orders,
    covers: s.covers,
    avgOrderValue: Number(s.avgOrderValue ?? 0),
  };
}

function normalizeOrderRow(tx: AnalyticsTransaction): OrderReportRow {
  const fields = pickStaffFields(tx as unknown as Record<string, unknown>);
  const resolved = resolveStaffDisplay({
    staffName: fields.staffName || tx.staffName,
    staffId: fields.staffId || tx.staffId,
    staff: fields.staffId || tx.staffId,
  });
  const staff = finalizeStaffDisplay(resolved, fields.staffId || tx.staffId);
  const raw = tx as unknown as Record<string, unknown>;
  const closedAtIso = String(
    tx.closedAt ?? raw.closed_at ?? tx.time ?? raw.timestamp ?? '',
  );
  const openedAtIso = String(tx.openedAt ?? raw.opened_at ?? '');
  const paymentId = String(tx.paymentId ?? raw.payment_id ?? tx.id ?? '').trim();
  const orderId = String(tx.orderId ?? raw.order_id ?? '').trim() || undefined;
  return {
    id: paymentId || tx.id,
    paymentId: paymentId || tx.id,
    orderId,
    openedAt: fmtDateTime(openedAtIso),
    closedAt: fmtDateTime(closedAtIso),
    closedAtIso,
    tableLabel: tx.tableLabel || '—',
    staff,
    method: tx.method,
    amount: Number(tx.amount ?? 0),
  };
}

function paymentTotalsFromOrders(orders: OrderReportRow[]) {
  const totals = { cash: 0, card: 0, qr: 0, room: 0 };
  for (const o of orders) {
    const m = o.method.toLowerCase();
    if (m.includes('cash')) totals.cash += o.amount;
    else if (m.includes('card')) totals.card += o.amount;
    else if (m.includes('qr')) totals.qr += o.amount;
    else if (m.includes('room')) totals.room += o.amount;
  }
  return totals;
}

function toCSV(rows: StaffReportRow[], orders: OrderReportRow[], from: string, to: string): string {
  const staffHeaders = ['Staff', 'Role', 'Revenue', 'Orders', 'Covers', 'Avg Order', 'Period From', 'Period To'];
  const staffLines = rows.map((r) =>
    [r.name, r.role, r.revenue, r.orders, r.covers, r.avgOrderValue.toFixed(2), from, to].join(','),
  );
  const orderHeaders = ['Opened', 'Closed at', 'Table', 'Staff', 'Method', 'Amount'];
  const orderLines = orders.map((o) =>
    [o.openedAt, o.closedAt, o.tableLabel, o.staff, o.method, o.amount.toFixed(2)].join(','),
  );
  return [
    'Staff Performance',
    staffHeaders.join(','),
    ...staffLines,
    '',
    'Orders',
    orderHeaders.join(','),
    ...orderLines,
  ].join('\n');
}

export default function ReportsPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const [dateRange, setDateRange] = useState(todayRange);
  const dateFrom = dateRange.from;
  const dateTo = dateRange.to;
  const [cashierFilter, setCashierFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalCovers, setTotalCovers] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [staffRows, setStaffRows] = useState<StaffReportRow[]>([]);
  const [orderRows, setOrderRows] = useState<OrderReportRow[]>([]);
  const [paymentTotals, setPaymentTotals] = useState({ cash: 0, card: 0, qr: 0, room: 0 });
  const [orderSortKey, setOrderSortKey] = useState<OrderSortKey>('closedAt');
  const [orderSortAsc, setOrderSortAsc] = useState(false);
  const [detailRow, setDetailRow] = useState<OrderReportRow | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      await ensureStaffNameCache({ force: true });
      const params = { range: 'custom' as const, from: dateFrom, to: dateTo };
      const analytics = await analyticsApi.summary(params);
      const perf = analytics.staffPerformance ?? [];
      registerStaffNames(
        Object.fromEntries(
          perf
            .map((p) => {
              const { staffId, staffName } = pickStaffFields(p as unknown as Record<string, unknown>);
              return [staffId, staffName] as const;
            })
            .filter(([id, n]) => Boolean(id) && !isPlaceholderStaffLabel(n)),
        ),
      );
      let transactions: AnalyticsTransaction[] = [];
      try {
        transactions = await analyticsApi.transactions(params);
      } catch {
        /* backend may not have /analytics/transactions yet */
      }
      registerStaffNames(
        Object.fromEntries(
          transactions
            .map((tx) => {
              const { staffId, staffName } = pickStaffFields(tx as unknown as Record<string, unknown>);
              return [staffId, staffName || tx.staffName] as const;
            })
            .filter(([id, n]) => Boolean(id) && !isPlaceholderStaffLabel(n)),
        ),
      );
      const orders = transactions.map(normalizeOrderRow);
      setTotalRevenue(analytics.totalRevenue ?? 0);
      setTotalOrders(analytics.totalOrders ?? orders.length);
      setTotalCovers(analytics.totalCovers ?? 0);
      setAvgOrderValue(analytics.avgOrderValue ?? 0);
      setStaffRows(perf.map(staffRow));
      setOrderRows(orders);
      setPaymentTotals(paymentTotalsFromOrders(orders));
    } catch {
      setFetchError(true);
      setTotalRevenue(0);
      setTotalOrders(0);
      setTotalCovers(0);
      setAvgOrderValue(0);
      setStaffRows([]);
      setOrderRows([]);
      setPaymentTotals({ cash: 0, card: 0, qr: 0, room: 0 });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const cashiers = useMemo(
    () => ['All', ...Array.from(new Set([...staffRows.map((r) => r.name), ...orderRows.map((r) => r.staff)]))],
    [staffRows, orderRows],
  );

  const filteredStaff = useMemo(() => {
    return staffRows
      .filter((r) => cashierFilter === 'All' || r.name === cashierFilter)
      .sort((a, b) => {
        let av = 0;
        let bv = 0;
        if (sortKey === 'name') {
          return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        if (sortKey === 'revenue') { av = a.revenue; bv = b.revenue; }
        else if (sortKey === 'orders') { av = a.orders; bv = b.orders; }
        else if (sortKey === 'covers') { av = a.covers; bv = b.covers; }
        return sortAsc ? av - bv : bv - av;
      });
  }, [staffRows, cashierFilter, sortKey, sortAsc]);

  const filteredOrders = useMemo(() => {
    return orderRows
      .filter((r) => cashierFilter === 'All' || r.staff === cashierFilter)
      .sort((a, b) => {
        if (orderSortKey === 'amount') {
          return orderSortAsc ? a.amount - b.amount : b.amount - a.amount;
        }
        if (orderSortKey === 'closedAt') {
          return orderSortAsc
            ? a.closedAtIso.localeCompare(b.closedAtIso)
            : b.closedAtIso.localeCompare(a.closedAtIso);
        }
        if (orderSortKey === 'openedAt') {
          return orderSortAsc ? a.openedAt.localeCompare(b.openedAt) : b.openedAt.localeCompare(a.openedAt);
        }
        const av = a[orderSortKey];
        const bv = b[orderSortKey];
        return orderSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
  }, [orderRows, cashierFilter, orderSortKey, orderSortAsc]);

  const grossTotal = paymentTotals.cash + paymentTotals.card + paymentTotals.qr + paymentTotals.room;
  const netTotal = totalRevenue || grossTotal;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleOrderSort = (key: OrderSortKey) => {
    if (orderSortKey === key) setOrderSortAsc(v => !v);
    else { setOrderSortKey(key); setOrderSortAsc(false); }
  };

  const handleExcel = () => {
    const csv = toCSV(filteredStaff, filteredOrders, dateFrom, dateTo);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skybar-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  if (locked) {
    return <LockModal isOpen={lockOpen} onClose={() => { setLockOpen(false); setLocked(false); }} onUnlock={() => { setLockOpen(false); setLocked(false); }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => { setLockOpen(true); setLocked(true); }} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => { setLockOpen(false); setLocked(false); }} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 size={22} className="text-primary" />
              Revenue Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live data from{' '}
              <code className="text-xs">GET /api/analytics/summary</code> +{' '}
              <code className="text-xs">GET /api/analytics/transactions</code>
              {' '}(eye → <code className="text-xs">/analytics/transactions/{'{paymentId}'}</code>,{' '}
              <code className="text-xs">/orders/details/{'{orderId}'}</code>)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadReport()}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={handleExcel}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs font-semibold transition-all"
            >
              <FileSpreadsheet size={14} />
              Export Excel / CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-xl border border-border p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            {/* Cashier Filter */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Cashier</label>
              <select
                value={cashierFilter}
                onChange={e => setCashierFilter(e.target.value)}
                className="field-input w-auto min-w-[9rem]"
              >
                {cashiers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/25">
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
            <p className="text-sm text-rose-400">Could not load report data. Check backend is running on port 8080.</p>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: `$${netTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <TrendingUp size={15} />, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
            { label: 'Avg Order Value', value: `$${avgOrderValue.toFixed(2)}`, icon: <DollarSign size={15} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Total Orders', value: totalOrders.toLocaleString(), icon: <Receipt size={15} />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Total Covers', value: totalCovers.toLocaleString(), icon: <Users size={15} />, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
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

        {/* Payment Method Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Cash Total', value: paymentTotals.cash, color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/15', icon: <DollarSign size={13} /> },
            { label: 'Card Total', value: paymentTotals.card, color: 'text-primary', bg: 'bg-primary/8 border-primary/15', icon: <CreditCard size={13} /> },
            { label: 'QR / Mobile', value: paymentTotals.qr, color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/15', icon: <QrCode size={13} /> },
            { label: 'Room Charge', value: paymentTotals.room, color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/15', icon: <BedDouble size={13} /> },
          ].map(m => (
            <div key={m.label} className={`rounded-xl border p-3 ${m.bg}`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${m.color}`}>
                {m.icon}
                {m.label}
              </div>
              <p className="text-lg font-bold text-foreground">${m.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground -mt-3 print:hidden">
          Payment method totals are calculated from paid orders in the selected date range.
        </p>

        {/* Order list */}
        <div className="glass-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt size={14} className="text-primary" />
              Orders — {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            </h2>
            <span className="text-xs text-muted-foreground">{formatDate(dateFrom)} – {formatDate(dateTo)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('openedAt')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Opened <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('closedAt')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Closed at <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('tableLabel')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Table <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('staff')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Staff <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('method')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Payment <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleOrderSort('amount')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Amount <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="w-10 py-2.5 px-2 text-muted-foreground font-medium print:hidden" aria-label="Detail" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">Loading orders…</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No paid orders for the selected date range.
                    </td>
                  </tr>
                ) : filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{o.openedAt}</td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap font-medium">{o.closedAt}</td>
                    <td className="py-2.5 px-3 font-medium text-foreground">{o.tableLabel}</td>
                    <td className="py-2.5 px-3 text-foreground">{o.staff}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{o.method}</td>
                    <td className="text-right py-2.5 px-3 font-semibold text-primary">${o.amount.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-center print:hidden">
                      <button
                        type="button"
                        title="View payment & order detail"
                        onClick={() => setDetailRow(o)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Staff report table */}
        <div className="glass-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt size={14} className="text-primary" />
              Staff Performance — {filteredStaff.length} {filteredStaff.length === 1 ? 'staff' : 'staff'}
            </h2>
            <span className="text-xs text-muted-foreground">{formatDate(dateFrom)} – {formatDate(dateTo)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      Staff <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Role</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleSort('revenue')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Revenue <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">
                    <button onClick={() => handleSort('orders')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Orders <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-right py-2.5 px-4 text-muted-foreground font-medium">
                    <button onClick={() => handleSort('covers')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                      Covers <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-right py-2.5 px-4 text-muted-foreground font-medium">Avg Order</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">Loading report data…</td>
                  </tr>
                ) : filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No staff data for the selected date range.
                    </td>
                  </tr>
                ) : filteredStaff.map((r) => (
                  <tr key={r.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-foreground">{r.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.role}</td>
                    <td className="text-right py-2.5 px-3 font-semibold text-primary">${r.revenue.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">{r.orders}</td>
                    <td className="text-right py-2.5 px-4 text-muted-foreground">{r.covers}</td>
                    <td className="text-right py-2.5 px-4 text-foreground">${r.avgOrderValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {detailRow && (
        <OrderDetailModal
          paymentId={detailRow.paymentId}
          orderIdHint={detailRow.orderId}
          tableLabel={detailRow.tableLabel}
          listSnapshot={{
            amount: detailRow.amount,
            method: detailRow.method,
            time: detailRow.closedAt,
            staff: detailRow.staff,
            tableLabel: detailRow.tableLabel,
          }}
          onClose={() => setDetailRow(null)}
        />
      )}

      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; color: black; }
          .glass-card { background: white; border: 1px solid #ddd; }
        }
      `}</style>
    </div>
  );
}
