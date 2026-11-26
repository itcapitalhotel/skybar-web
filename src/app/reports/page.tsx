'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import {
  Printer, FileSpreadsheet, Receipt, Users,
  BarChart3, ArrowUpDown, RefreshCw, AlertCircle,
} from 'lucide-react';
import OrderDetailModal from '@/app/reports/OrderDetailModal';
import ReopenOrderDialog from '@/app/reports/ReopenOrderDialog';
import SkyBarShopReport from '@/app/reports/SkyBarShopReport';
import { buildMenuCategoryLookup, buildShopReportCsv, DEFAULT_REPORT_RATES, type ReportRates } from '@/app/reports/reportDocumentHelpers';
import DateRangePicker, { todayRange } from '@/components/DateRangePicker';
import { toast } from 'sonner';
import { analyticsApi, configApi, menuApi, menuCategoryApi, ordersApi, tablesApi, zonesApi } from '@/lib/api/client';
import { checkKey } from '@/app/reports/reportDocumentHelpers';
import type { MenuCategoryLookup, ReportGridRow } from '@/app/reports/reportDocumentHelpers';
import {
  ensureStaffNameCache,
  finalizeStaffDisplay,
  isPlaceholderStaffLabel,
  pickStaffFields,
  registerStaffNames,
  resolveStaffDisplay,
} from '@/lib/staffDisplay';
import type {
  AnalyticsStaffPerformance,
  AnalyticsTransaction,
  AnalyticsTransactionDetail,
  OrderDetailsPayment,
  PaymentBreakdown,
  TableData,
  ZoneData,
} from '@/lib/api/types';
import { buildTableZoneLookup, resolveZoneFromFields } from '@/lib/zoneResolve';

async function mapPool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

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
  cardName?: string | null;
  cardNumber?: string | null;
  cashTendered?: number | null;
  changeAmount?: number | null;
  roomNumber?: string | null;
  tenderGroupId?: string | null;
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
    cardName: (tx.cardName ?? raw.card_name ?? null) as string | null,
    cardNumber: (tx.cardNumber ?? raw.card_number ?? null) as string | null,
    cashTendered: numOrNull(raw.cashTendered ?? raw.cash_tendered ?? tx.cashTendered),
    changeAmount: numOrNull(raw.changeAmount ?? raw.change_amount ?? tx.changeAmount),
    roomNumber: (tx.roomNumber ?? raw.room_number ?? null) as string | null,
    tenderGroupId: (tx.tenderGroupId ?? raw.tender_group_id ?? null) as string | null,
  };
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mergeTenders(
  existing: OrderDetailsPayment[] | undefined,
  rows: AnalyticsTransaction[],
): OrderDetailsPayment[] {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map((payment) => payment.paymentId).filter(Boolean));
  for (const tx of rows) {
    const paymentId = tx.paymentId || tx.id;
    if (!paymentId || seen.has(paymentId)) continue;
    seen.add(paymentId);
    merged.push({
      paymentId,
      method: tx.method,
      amount: Number(tx.amount ?? 0),
      time: tx.closedAt || tx.time || '',
      staffId: tx.staffId,
      staffName: tx.staffName,
      cardName: tx.cardName,
      cardNumber: tx.cardNumber,
      cashTendered: tx.cashTendered,
      change: tx.changeAmount,
      roomNumber: tx.roomNumber,
      tenderGroupId: tx.tenderGroupId,
      orderId: tx.orderId,
    });
  }
  return merged;
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
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);
  const [menuLookup, setMenuLookup] = useState<MenuCategoryLookup | undefined>(undefined);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<number | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailRow, setDetailRow] = useState<OrderReportRow | null>(null);
  const [updateRow, setUpdateRow] = useState<ReportGridRow | null>(null);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [printZoneId, setPrintZoneId] = useState('');
  const [reportPrinter, setReportPrinter] = useState({ name: '', ip: '', port: '9100' });
  const [venueTimezone, setVenueTimezone] = useState('Asia/Bangkok');
  const [venueRates, setVenueRates] = useState<ReportRates>(DEFAULT_REPORT_RATES);
  const [printingLong, setPrintingLong] = useState(false);
  const reportGen = useRef(0);

  const loadReport = useCallback(async () => {
    const gen = ++reportGen.current;
    const current = () => gen === reportGen.current;
    setLoading(true);
    setFetchError(false);
    try {
      await ensureStaffNameCache();
      if (!current()) return;
      const params = { range: 'custom' as const, from: dateFrom, to: dateTo };
      const [analytics, breakdown] = await Promise.all([
        analyticsApi.summary(params),
        analyticsApi.paymentBreakdown(params).catch(() => [] as PaymentBreakdown[]),
      ]);
      setPaymentBreakdown(breakdown);
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
      const groups = new Map<string, AnalyticsTransaction[]>();
      for (const tx of transactions) {
        const key = checkKey({
          orderId: tx.orderId,
          paymentId: tx.paymentId || tx.id,
          tenderGroupId: tx.tenderGroupId,
        });
        const bucket = groups.get(key) ?? [];
        bucket.push(tx);
        groups.set(key, bucket);
      }
      const orders = Array.from(groups.values()).map((rows) => {
        const primary = normalizeOrderRow(rows[0]);
        const amount = rows.reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0);
        return {
          ...primary,
          amount,
          method: rows.map((tx) => tx.method).filter(Boolean).join(' + ') || primary.method,
        };
      });
      setStaffRows(perf.map(staffRow));
      setOrderRows(orders);
      setReportGeneratedAt(Date.now());
      setLoading(false);

      setLoadingDetails(true);
      const [categories, menuItems, tables, zoneList, batch] = await Promise.all([
        menuCategoryApi.list().catch(() => []),
        menuApi.list().catch(() => []),
        tablesApi.list().catch(() => [] as TableData[]),
        zonesApi.list().catch(() => [] as ZoneData[]),
        analyticsApi.checkDetails(params).catch(() => null),
      ]);
      if (!current()) return;
      if (categories.length || menuItems.length) {
        setMenuLookup(buildMenuCategoryLookup(categories, menuItems));
      }
      if (batch) {
        setOrderDetails(batch);
        setLoadingDetails(false);
        return;
      }
      const zoneLookup = buildTableZoneLookup(tables, zoneList);

      const details = await mapPool(orders, 4, async (o) => {
          const siblings = groups.get(checkKey({
            orderId: o.orderId,
            paymentId: o.paymentId,
            tenderGroupId: o.tenderGroupId,
          })) ?? [];
          try {
            let detail: AnalyticsTransactionDetail;
            try {
              detail = await analyticsApi.getTransaction(o.paymentId);
            } catch (err) {
              if (!o.orderId) throw err;
              detail = await ordersApi.getDetails(o.orderId) as unknown as AnalyticsTransactionDetail;
            }
            const withTenders = {
              ...detail,
              paymentId: detail.paymentId || o.paymentId,
              payments: mergeTenders(detail.payments, siblings),
            };
            const raw = detail as unknown as Record<string, unknown>;
            const zoneLabel = resolveZoneFromFields(
              {
                zoneId: detail.zoneId ?? (raw.zone_id as string | undefined),
                zoneLabel: detail.zoneLabel ?? (raw.zone_label as string | undefined),
                zone: raw.zone as string | undefined,
                tableId: detail.tableId,
                tableLabel: detail.tableLabel || o.tableLabel,
              },
              zoneLookup,
              zoneList,
            ).zone;
            return {
              ...withTenders,
              orderId: detail.orderId || o.orderId,
              zoneLabel: zoneLabel !== 'Other' ? zoneLabel : detail.zoneLabel || zoneLabel,
            };
          } catch {
            const zoneLabel = resolveZoneFromFields(
              {
                tableLabel: o.tableLabel,
              },
              zoneLookup,
              zoneList,
            ).zone;
            return {
              paymentId: o.paymentId,
              orderId: o.orderId,
              tableId: '',
              tableLabel: o.tableLabel,
              zoneLabel: zoneLabel !== 'Other' ? zoneLabel : undefined,
              method: o.method,
              amount: o.amount,
              total: o.amount,
              foodSubtotal: o.foodSubtotal,
              drinkSubtotal: o.drinkSubtotal,
              openedAt: o.openedAt,
              closedAt: o.closedAtIso,
              time: o.closedAtIso,
              staffName: o.staff,
              cardName: o.cardName,
              cardNumber: o.cardNumber,
              items: [],
              payments: mergeTenders(undefined, siblings),
            } satisfies AnalyticsTransactionDetail;
          }
      });
      if (!current()) return;
      setOrderDetails(details);
      setLoadingDetails(false);
    } catch {
      if (!current()) return;
      setFetchError(true);
      setStaffRows([]);
      setOrderRows([]);
      setOrderDetails([]);
      setPaymentBreakdown([]);
      setMenuLookup(undefined);
      setLoadingDetails(false);
    } finally {
      if (current()) {
        setLoading(false);
        setLoadingDetails(false);
      }
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    let cancelled = false;
    configApi.get()
      .then((config) => {
        if (cancelled) return;
        setReportPrinter({
          name: config.reportPrinterName ?? '',
          ip: config.reportPrinterIp ?? '',
          port: String(config.reportPrinterPort ?? 9100),
        });
        if (config.timezone) {
          setVenueTimezone(config.timezone);
        }
        const sc = Number(config.serviceCharge);
        const vat = Number(config.vatRate);
        setVenueRates({
          serviceChargePercent: Number.isFinite(sc) ? sc : DEFAULT_REPORT_RATES.serviceChargePercent,
          vatPercent: Number.isFinite(vat) ? vat : DEFAULT_REPORT_RATES.vatPercent,
        });
      })
      .catch(() => { /* print stays blocked until a printer IP is saved */ });
    zonesApi.list()
      .then((list) => { if (!cancelled) setZones(list); })
      .catch(() => { if (!cancelled) setZones([]); });
    return () => { cancelled = true; };
  }, []);

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
    const csv = buildShopReportCsv(
      filteredOrderDetails,
      dateFrom,
      dateTo,
      new Date(reportGeneratedAt ?? Date.now()),
      menuLookup,
      paymentBreakdown,
      venueRates,
    );
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skybar-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const handlePrintLongReport = async () => {
    if (printingLong) return;
    const printerIp = reportPrinter.ip.trim();
    if (!printerIp) {
      toast.error('Add the long report printer IP in Admin Config first.');
      return;
    }
    const port = Number(reportPrinter.port) || 9100;
    setPrintingLong(true);
    try {
      const result = await analyticsApi.printLongReport({
        printerName: reportPrinter.name.trim() || undefined,
        printerIp,
        printerPort: port,
        range: 'custom',
        from: dateFrom,
        to: dateTo,
        timezone: venueTimezone,
        zoneId: printZoneId || undefined,
      });
      if (result.printed) {
        toast.success(result.message || 'Long report sent to printer');
      } else {
        toast.error(result.message || 'The long report did not print');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not print the long report');
    } finally {
      setPrintingLong(false);
    }
  };

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
              NAKNAK POS Shop Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Summary, payment breakdown, and line-item detail — print or export for accounting.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {reportPrinter.ip
                ? `Long report prints to ${reportPrinter.name ? `${reportPrinter.name} · ` : ''}${reportPrinter.ip}:${reportPrinter.port || 9100}`
                : 'Long report printer is not set. Add the printer IP in Admin Config.'}
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
              onClick={() => void handlePrintLongReport()}
              disabled={printingLong}
              title={reportPrinter.ip ? `Sends the long tape to ${reportPrinter.ip}:${reportPrinter.port || 9100}` : 'Set the printer IP in Admin Config'}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Receipt size={14} />
              {printingLong ? 'Printing…' : 'Print long report'}
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
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Long report zone</label>
              <select
                value={printZoneId}
                onChange={e => setPrintZoneId(e.target.value)}
                className="field-input w-auto min-w-[9rem]"
              >
                <option value="">All zones</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
            </div>
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
            <p className="text-sm text-rose-400">Could not load report data. Please try again or contact support.</p>
          </div>
        )}

        <SkyBarShopReport
          dateFrom={dateFrom}
          dateTo={dateTo}
          generatedAt={reportGeneratedAt}
          orderDetails={filteredOrderDetails}
          paymentBreakdown={paymentBreakdown}
          menuLookup={menuLookup}
          rates={venueRates}
          loading={loading || loadingDetails}
          onViewOrder={(paymentId) => {
            const row = orderRows.find((o) => o.paymentId === paymentId);
            if (row) setDetailRow(row);
          }}
          onReopenOrder={(row) => setUpdateRow(row)}
        />

        {/* Staff performance (screen only) */}
        <div className="glass-card rounded-xl border border-border overflow-hidden print:hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt size={14} className="text-primary" />
              Staff Performance — {filteredStaff.length} {filteredStaff.length === 1 ? 'staff' : 'staff'}
            </h2>
            <span className="text-xs text-muted-foreground">{formatDate(dateFrom)} – {formatDate(dateTo)} · 5:00 AM–5:00 AM</span>
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
            cardName: detailRow.cardName,
            cardNumber: detailRow.cardNumber,
          }}
          onClose={() => setDetailRow(null)}
        />
      )}

      {updateRow?.orderId ? (
        <ReopenOrderDialog
          orderId={updateRow.orderId}
          orderLabel={updateRow.orderLabel}
          tableLabel={updateRow.tableLabel}
          paymentId={updateRow.paymentId}
          onClose={() => setUpdateRow(null)}
          onChanged={() => { void loadReport(); }}
        />
      ) : null}

      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .print\\:hidden { display: none !important; }
          body { background: white !important; color: black !important; }
          main { max-width: none !important; padding: 0 !important; }
          .skybar-shop-report {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .skybar-shop-report table { width: 100%; border-collapse: collapse; }
          .skybar-shop-report thead { display: table-header-group; }
          .skybar-shop-report tr { break-inside: avoid; page-break-inside: avoid; }
          .report-detail-table { min-width: 0 !important; }
          .report-detail-table th,
          .report-detail-table td {
            font-size: 7px !important;
            line-height: 1.15 !important;
            padding: 1px 3px !important;
            white-space: normal !important;
          }
        }
      `}</style>
    </div>
  );
}
