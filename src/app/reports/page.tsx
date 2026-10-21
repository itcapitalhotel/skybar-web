'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import {
  Printer, FileSpreadsheet, Receipt, Users,
  BarChart3, ArrowUpDown, RefreshCw, AlertCircle,
} from 'lucide-react';
import OrderDetailModal from '@/app/reports/OrderDetailModal';
import SkyBarShopReport from '@/app/reports/SkyBarShopReport';
import { buildMenuCategoryLookup, buildShopReportCsv } from '@/app/reports/reportDocumentHelpers';
import DateRangePicker, { todayRange } from '@/components/DateRangePicker';
import { analyticsApi, menuApi, menuCategoryApi } from '@/lib/api/client';
import type { MenuCategoryLookup } from '@/app/reports/reportDocumentHelpers';
import {
  ensureStaffNameCache,
  finalizeStaffDisplay,
  isPlaceholderStaffLabel,
  pickStaffFields,
  registerStaffNames,
  resolveStaffDisplay,
} from '@/lib/staffDisplay';
import type { AnalyticsStaffPerformance, AnalyticsTransaction, AnalyticsTransactionDetail } from '@/lib/api/types';

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
  foodSubtotal?: number;
  drinkSubtotal?: number;
}

type SortKey = 'name' | 'revenue' | 'orders' | 'covers';
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
  const foodRaw = raw.foodSubtotal ?? raw.food_subtotal;
  const drinkRaw = raw.drinkSubtotal ?? raw.drink_subtotal;
  const foodSubtotal = foodRaw != null ? Number(foodRaw) : tx.foodSubtotal;
  const drinkSubtotal = drinkRaw != null ? Number(drinkRaw) : tx.drinkSubtotal;
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
    foodSubtotal: Number.isFinite(foodSubtotal) ? foodSubtotal : undefined,
    drinkSubtotal: Number.isFinite(drinkSubtotal) ? drinkSubtotal : undefined,
  };
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

  const [staffRows, setStaffRows] = useState<StaffReportRow[]>([]);
  const [orderRows, setOrderRows] = useState<OrderReportRow[]>([]);
  const [orderDetails, setOrderDetails] = useState<AnalyticsTransactionDetail[]>([]);
  const [menuLookup, setMenuLookup] = useState<MenuCategoryLookup | undefined>(undefined);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date());
  const [loadingDetails, setLoadingDetails] = useState(false);
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
      setStaffRows(perf.map(staffRow));
      setOrderRows(orders);
      setReportGeneratedAt(new Date());

      try {
        const [categories, menuItems] = await Promise.all([
          menuCategoryApi.list(),
          menuApi.list(),
        ]);
        setMenuLookup(buildMenuCategoryLookup(categories, menuItems));
      } catch {
        setMenuLookup(undefined);
      }

      setLoadingDetails(true);
      const details = await Promise.all(
        orders.map(async (o) => {
          try {
            return await analyticsApi.getTransaction(o.paymentId);
          } catch {
            return {
              paymentId: o.paymentId,
              orderId: o.orderId,
              tableId: '',
              tableLabel: o.tableLabel,
              method: o.method,
              amount: o.amount,
              total: o.amount,
              foodSubtotal: o.foodSubtotal,
              drinkSubtotal: o.drinkSubtotal,
              openedAt: o.openedAt,
              closedAt: o.closedAtIso,
              time: o.closedAtIso,
              staffName: o.staff,
              items: [],
            } satisfies AnalyticsTransactionDetail;
          }
        }),
      );
      setOrderDetails(details);
      setLoadingDetails(false);
    } catch {
      setFetchError(true);
      setStaffRows([]);
      setOrderRows([]);
      setOrderDetails([]);
      setMenuLookup(undefined);
      setLoadingDetails(false);
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

  const filteredOrderDetails = useMemo(() => {
    const staffByPayment = new Map(orderRows.map((o) => [o.paymentId, o.staff]));
    return orderDetails.filter((d) => {
      if (cashierFilter === 'All') return true;
      const staff = staffByPayment.get(d.paymentId) ?? d.staffName ?? '';
      return staff === cashierFilter;
    });
  }, [orderDetails, orderRows, cashierFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleExcel = () => {
    const csv = buildShopReportCsv(filteredOrderDetails, dateFrom, dateTo, reportGeneratedAt, menuLookup);
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
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
              SkyBar Shop Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Summary, payment breakdown, and line-item detail — print or export for accounting.
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
              disabled={loading || loadingDetails}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs font-semibold transition-all disabled:opacity-50"
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

        <SkyBarShopReport
          dateFrom={dateFrom}
          dateTo={dateTo}
          generatedAt={reportGeneratedAt}
          orderDetails={filteredOrderDetails}
          menuLookup={menuLookup}
          loading={loading || loadingDetails}
          onViewOrder={(paymentId) => {
            const row = orderRows.find((o) => o.paymentId === paymentId);
            if (row) setDetailRow(row);
          }}
        />

        {/* Staff performance (screen only) */}
        <div className="glass-card rounded-xl border border-border overflow-hidden print:hidden">
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
          body { background: white !important; color: black !important; }
          main { max-width: none !important; padding: 0 !important; }
          .skybar-shop-report {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
