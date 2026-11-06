'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import {
  TrendingUp, BarChart2, Users, Clock,
  RefreshCw, DollarSign, Repeat, Award, MapPin, CreditCard, Star,
} from 'lucide-react';
import DateRangePicker, { type DateRangeValue } from '@/components/DateRangePicker';
import { analyticsApi, configApi, dashboardApi, zonesApi } from '@/lib/api/client';
import type {
  AnalyticsQueryParams,
  AnalyticsRevenueSeriesPoint,
  AnalyticsZoneRevenue,
  DashboardSummary,
  PaymentBreakdown,
  ZoneData,
} from '@/lib/api/types';
import { findZone } from '@/lib/zoneResolve';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
type RevenueGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RevenuePoint {
  key: string;
  /** Short axis tick under the bar */
  label: string;
  /** Fuller label for tooltips / peak copy */
  fullLabel: string;
  revenue: number;
  orders: number;
}

const REVENUE_VIEWS: { id: RevenueGranularity; label: string }[] = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

interface TopItem {
  name: string;
  qty: number;
  revenue: number;
  category: string;
}

interface TableTurnover {
  zoneId?: string;
  zone: string;
  avgMinutes: number;
  turns: number;
  revenue: number;
  color: string;
}

interface StaffPerformance {
  name: string;
  role: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
  covers: number;
  avatar: string;
  color: string;
}

type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

const DATE_PRESETS: { id: Exclude<DatePreset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
];

const EMPTY_DASHBOARD: DashboardSummary = {
  zoneRevenue: [],
  topItems: [],
  paymentBreakdown: [],
  hourlyData: [],
  activeTables: 0,
  awaitingBill: 0,
};

const DEFAULT_TIMEZONE = 'Asia/Bangkok';
const PAYMENT_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#64748b'];
const FALLBACK_ZONE_COLORS = ['#f59e0b', '#06b6d4', '#10b981', '#a855f7', '#ec4899', '#64748b'];

interface ZoneRevenueRow {
  zoneId: string;
  zone: string;
  revenue: number;
  orders: number;
  tables: number;
  color: string;
}

interface ZoneSeriesPoint {
  key: string;
  label: string;
  fullLabel?: string;
  revenue: number;
  orders: number;
  [zoneKey: string]: string | number | undefined;
}

function zoneSlug(zoneId: string): string {
  return `z_${String(zoneId).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

function toApiGranularity(g: RevenueGranularity): AnalyticsQueryParams['granularity'] {
  switch (g) {
    case 'hourly': return 'hour';
    case 'daily': return 'day';
    case 'weekly': return 'week';
    case 'monthly': return 'month';
    case 'yearly': return 'year';
  }
}

/** YYYY-MM-DD in a venue IANA timezone */
function venueDateString(timezone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

function addCalendarDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function venueTodayRange(timezone: string): DateRangeValue {
  const t = venueDateString(timezone);
  return { from: t, to: t };
}

function presetToRange(preset: Exclude<DatePreset, 'custom'>, timezone: string): DateRangeValue {
  const today = venueDateString(timezone);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const y = addCalendarDays(today, -1);
    return { from: y, to: y };
  }
  if (preset === '7d') return { from: addCalendarDays(today, -6), to: today };
  return { from: addCalendarDays(today, -29), to: today };
}

/** Suggested window when switching granularity — still synced for Total + Zone */
function rangeForGranularity(g: RevenueGranularity, timezone: string): DateRangeValue {
  const today = venueDateString(timezone);
  if (g === 'hourly') return { from: today, to: today };
  if (g === 'daily') return { from: addCalendarDays(today, -13), to: today };
  if (g === 'weekly') return { from: addCalendarDays(today, -(7 * 11)), to: today };
  if (g === 'monthly') return { from: addCalendarDays(today, -364), to: today };
  return { from: addCalendarDays(today, -(365 * 4)), to: today };
}

function buildQuery(
  preset: DatePreset,
  from: string,
  to: string,
  timezone: string,
  extra?: Pick<AnalyticsQueryParams, 'zoneId' | 'granularity'>,
): AnalyticsQueryParams {
  return {
    range: preset === 'custom' ? 'custom' : preset,
    from,
    to,
    timezone: timezone || DEFAULT_TIMEZONE,
    ...extra,
  };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseYmd(raw: string): { y: number; m: number; d: number } | null {
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function formatHourShort(hour: string | number): string {
  const raw = String(hour ?? '');
  const hhmm = raw.match(/^(\d{1,2})/);
  const h = typeof hour === 'number' ? hour : hhmm ? Number(hhmm[1]) : NaN;
  if (!Number.isFinite(h)) return raw.slice(0, 4);
  const h12 = h % 12 || 12;
  return `${h12}${h >= 12 ? 'p' : 'a'}`;
}

function formatHourFull(hour: string | number): string {
  const raw = String(hour ?? '');
  const hhmm = raw.match(/^(\d{1,2})/);
  const h = typeof hour === 'number' ? hour : hhmm ? Number(hhmm[1]) : NaN;
  if (!Number.isFinite(h)) return raw;
  const h12 = h % 12 || 12;
  return `${h12} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Compact professional axis ticks — keep tooltips readable via fullLabel. */
function formatAxisLabel(key: string, apiLabel: string, g: RevenueGranularity): { label: string; fullLabel: string } {
  const k = String(key ?? '').trim();
  const api = String(apiLabel ?? '').trim();

  if (g === 'hourly') {
    return { label: formatHourShort(k || api), fullLabel: formatHourFull(k || api) };
  }

  if (g === 'daily') {
    const ymd = parseYmd(k) || parseYmd(api);
    if (ymd) {
      const mon = MONTHS_SHORT[ymd.m - 1] ?? '';
      return { label: `${ymd.d}`, fullLabel: `${mon} ${ymd.d}` };
    }
    const named = api.match(/([A-Za-z]{3})\s+(\d{1,2})/);
    if (named) return { label: named[2], fullLabel: `${named[1]} ${named[2]}` };
    return { label: api.slice(0, 4) || k.slice(-2), fullLabel: api || k };
  }

  if (g === 'weekly') {
    const ymd = parseYmd(k);
    if (ymd) {
      const mon = MONTHS_SHORT[ymd.m - 1] ?? '';
      return { label: `${ymd.d} ${mon}`, fullLabel: `Week of ${mon} ${ymd.d}` };
    }
    const cleaned = api.replace(/^W\s*/i, '').trim();
    const named = cleaned.match(/([A-Za-z]{3})\s+(\d{1,2})/);
    if (named) return { label: `${named[2]} ${named[1]}`, fullLabel: `Week of ${named[1]} ${named[2]}` };
    return { label: cleaned.slice(0, 6) || k.slice(5, 10), fullLabel: cleaned || k };
  }

  if (g === 'monthly') {
    const ym = k.match(/^(\d{4})-(\d{2})/) || api.match(/^(\d{4})-(\d{2})/);
    if (ym) {
      const mon = MONTHS_SHORT[Number(ym[2]) - 1] ?? ym[2];
      return { label: mon, fullLabel: `${mon} ${ym[1]}` };
    }
    const named = api.match(/([A-Za-z]{3})/);
    if (named) return { label: named[1], fullLabel: api };
    return { label: api.slice(0, 3) || k.slice(5, 7), fullLabel: api || k };
  }

  // yearly
  const y = k.match(/^(\d{4})/) || api.match(/^(\d{4})/);
  if (y) return { label: y[1].slice(2), fullLabel: y[1] }; // '26'
  return { label: (api || k).slice(0, 4), fullLabel: api || k };
}

function formatMoneyTick(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000;
    return `$${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  return `$${Math.round(value)}`;
}

function mapSeriesToChart(rows: AnalyticsRevenueSeriesPoint[], g: RevenueGranularity): RevenuePoint[] {
  return (rows ?? []).map((row) => {
    const key = String(row.key ?? '');
    const { label, fullLabel } = formatAxisLabel(key, String(row.label ?? key), g);
    return {
      key,
      label,
      fullLabel,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
    };
  });
}

function axisTickInterval(count: number): number | 'preserveStartEnd' {
  if (count <= 8) return 0;
  if (count <= 14) return 1;
  if (count <= 24) return Math.ceil(count / 10) - 1;
  return Math.ceil(count / 8) - 1;
}

function colorizePayments(rows: PaymentBreakdown[] | undefined): PaymentBreakdown[] {
  return (rows ?? [])
    .map((p, i) => ({
      name: String(p.name || 'Other'),
      value: Number(p.value) || 0,
      color: p.color || PAYMENT_COLORS[i % PAYMENT_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function mapZoneRevenueRows(
  apiRows: AnalyticsZoneRevenue[] | undefined,
  zones: ZoneData[],
): ZoneRevenueRow[] {
  const rows = (apiRows ?? []).map((z, i) => {
    const matched = findZone(zones, z.zoneId) || findZone(zones, z.zone);
    return {
      zoneId: String(z.zoneId || matched?.id || z.zone),
      zone: matched?.label || z.zone || z.zoneId,
      revenue: Number(z.revenue) || 0,
      orders: Number(z.orders) || 0,
      tables: Number(z.tablesWithSales) || 0,
      color: matched?.color || FALLBACK_ZONE_COLORS[i % FALLBACK_ZONE_COLORS.length],
    };
  });
  return rows.sort((a, b) => b.revenue - a.revenue || a.zone.localeCompare(b.zone));
}

function mapZoneSeries(
  rows: AnalyticsRevenueSeriesPoint[],
  zoneKeys: Array<{ zoneId: string; zone: string; key: string; color: string }>,
  selectedZoneId: string,
  g: RevenueGranularity,
): ZoneSeriesPoint[] {
  if (selectedZoneId !== 'all') {
    return mapSeriesToChart(rows, g).map((p) => ({ ...p }));
  }

  return (rows ?? []).map((row) => {
    const key = String(row.key ?? '');
    const { label, fullLabel } = formatAxisLabel(key, String(row.label ?? key), g);
    const point: ZoneSeriesPoint = {
      key,
      label,
      fullLabel,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
    };
    for (const z of zoneKeys) point[z.key] = 0;
    for (const bz of row.byZone ?? []) {
      const match = zoneKeys.find((z) => z.zoneId === bz.zoneId)
        || zoneKeys.find((z) => z.zone === bz.zone);
      const slug = match?.key || zoneSlug(bz.zoneId || bz.zone);
      if (!(slug in point)) point[slug] = 0;
      point[slug] = (Number(point[slug]) || 0) + (Number(bz.revenue) || 0);
    }
    return point;
  });
}

function granularityCopy(g: RevenueGranularity): { title: string; subtitle: string; peakLabel: string } {
  switch (g) {
    case 'hourly':
      return { title: 'Hourly Revenue', subtitle: 'Sales by hour of day', peakLabel: 'Peak Hour' };
    case 'daily':
      return { title: 'Daily Revenue', subtitle: 'Sales by day', peakLabel: 'Peak Day' };
    case 'weekly':
      return { title: 'Weekly Revenue', subtitle: 'Sales by week', peakLabel: 'Peak Week' };
    case 'monthly':
      return { title: 'Monthly Revenue', subtitle: 'Sales by month', peakLabel: 'Peak Month' };
    case 'yearly':
      return { title: 'Yearly Revenue', subtitle: 'Sales by year', peakLabel: 'Peak Year' };
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Cocktails: '#f59e0b',
  Food: '#10b981',
  food: '#10b981',
  Bottles: '#a855f7',
  Beer: '#06b6d4',
  Spirits: '#f59e0b',
  Wine: '#a855f7',
  Hookah: '#ec4899',
  Bites: '#10b981',
};

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; payload: RevenuePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as RevenuePoint | undefined;
  const revenue = payload.find((p) => p.name === 'revenue')?.value ?? row?.revenue ?? 0;
  const orders = payload.find((p) => p.name === 'orders')?.value ?? row?.orders ?? 0;
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs shadow-2xl min-w-[140px]"
      style={{ background: 'rgba(10,18,35,0.96)', border: '1px solid rgba(6,182,212,0.25)' }}
    >
      <p className="text-foreground mb-2 font-semibold tracking-wide">{row?.fullLabel || row?.label || ''}</p>
      <div className="space-y-1">
        <p className="flex items-center justify-between gap-4">
          <span className="text-cyan-400/80">Revenue</span>
          <span className="font-semibold text-cyan-300">
            ${Number(revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </p>
        <p className="flex items-center justify-between gap-4">
          <span className="text-amber-400/80">Orders</span>
          <span className="font-semibold text-amber-300">{orders}</span>
        </p>
      </div>
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs shadow-2xl" style={{ background: 'rgba(10,18,35,0.95)', border: '1px solid rgba(100,116,139,0.2)' }}>
      <p className="text-foreground mb-1 font-semibold">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name === 'revenue'
            ? `Revenue $${Number(p.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${p.name} $${Number(p.value).toLocaleString()}`}
        </p>
      ))}
    </div>
  );
}

function ZoneHourlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; payload?: ZoneSeriesPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const full = payload[0]?.payload?.fullLabel || label;
  return (
    <div className="rounded-xl border border-border px-3 py-2.5 text-xs shadow-xl" style={{ background: 'rgba(10,18,35,0.96)' }}>
      <p className="mb-1.5 font-semibold text-foreground">{full}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">${Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [isLocked, setIsLocked] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [preset, setPreset] = useState<DatePreset>('today');
  const [pickerRange, setPickerRange] = useState<DateRangeValue>(() => venueTodayRange(DEFAULT_TIMEZONE));
  const [granularity, setGranularity] = useState<RevenueGranularity>('hourly');
  const [zoneGranularity, setZoneGranularity] = useState<RevenueGranularity>('hourly');
  const [loading, setLoading] = useState(false);
  const [zoneLoading, setZoneLoading] = useState(false);

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [totalCovers, setTotalCovers] = useState(0);
  const [chartData, setChartData] = useState<RevenuePoint[]>([]);
  const [zoneSeriesRaw, setZoneSeriesRaw] = useState<AnalyticsRevenueSeriesPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [turnover, setTurnover] = useState<TableTurnover[]>([]);
  const [staffPerf, setStaffPerf] = useState<StaffPerformance[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary>(EMPTY_DASHBOARD);
  const [dashError, setDashError] = useState<string | null>(null);
  const [zoneRevenue, setZoneRevenue] = useState<ZoneRevenueRow[]>([]);
  const [zoneOptions, setZoneOptions] = useState<Array<{ zoneId: string; zone: string; color: string }>>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const zonesRef = useRef<ZoneData[]>([]);

  const viewCopy = granularityCopy(granularity);
  const zoneViewCopy = granularityCopy(zoneGranularity);

  const peakPoint = chartData.length > 0
    ? chartData.reduce((a, h) => (h.revenue > a.revenue ? h : a), chartData[0])
    : { key: '-', label: '—', fullLabel: '—', revenue: 0, orders: 0 };

  const zoneSeriesKeys = zoneRevenue.map((z) => ({
    zoneId: z.zoneId,
    zone: z.zone,
    key: zoneSlug(z.zoneId || z.zone),
    color: z.color,
  }));

  const selectedZoneMeta =
    selectedZone === 'all'
      ? undefined
      : zoneRevenue.find((z) => z.zoneId === selectedZone)
        || zoneOptions.find((z) => z.zoneId === selectedZone);

  const zoneChartData = mapZoneSeries(
    zoneSeriesRaw,
    zoneSeriesKeys,
    selectedZone,
    zoneGranularity,
  );

  const zonePeak = zoneChartData.length > 0
    ? zoneChartData.reduce((a, h) => (h.revenue > a.revenue ? h : a), zoneChartData[0])
    : { key: '-', label: '—', fullLabel: '—', revenue: 0, orders: 0 };

  const zoneListTotal = zoneRevenue.reduce((s, z) => s + z.revenue, 0);
  const selectedZoneTotal =
    selectedZone === 'all'
      ? zoneListTotal
      : (selectedZoneMeta
        ? zoneRevenue.find((z) => z.zoneId === selectedZone)?.revenue ?? 0
        : 0);
  const selectedZoneOrders =
    selectedZone === 'all'
      ? zoneRevenue.reduce((s, z) => s + z.orders, 0)
      : zoneRevenue.find((z) => z.zoneId === selectedZone)?.orders ?? 0;
  const totalPayments = paymentBreakdown.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const maxZoneRevenue = Math.max(1, ...zoneRevenue.map((z) => z.revenue));
  const selectedZoneColor =
    selectedZone === 'all'
      ? '#06b6d4'
      : selectedZoneMeta?.color || '#06b6d4';
  const selectedZoneLabel =
    selectedZone === 'all' ? 'All Zones' : selectedZoneMeta?.zone || selectedZone;

  const applySummaryPanels = (data: Awaited<ReturnType<typeof analyticsApi.summary>>, zones: ZoneData[]) => {
    setTotalRevenue(Number(data.totalRevenue) || 0);
    setTotalOrders(Number(data.totalOrders) || 0);
    setAvgOrderValue(Number(data.avgOrderValue) || 0);
    setTotalCovers(Number(data.totalCovers) || 0);

    setTopItems((data.topItems ?? []).map((i) => ({
      name: i.name,
      qty: Number(i.qty) || 0,
      revenue: Number(i.revenue) || 0,
      category: i.category,
    })));

    setTurnover((data.tableTurnover ?? []).map((t) => {
      const matched = findZone(zones, t.zoneId) || findZone(zones, t.zone);
      return {
        zoneId: t.zoneId || matched?.id,
        zone: matched?.label || t.zone,
        avgMinutes: Number(t.avgMinutes) || 0,
        turns: Number(t.turns) || 0,
        revenue: Number(t.revenue) || 0,
        color: matched?.color || '#06b6d4',
      };
    }));

    setStaffPerf((data.staffPerformance ?? []).map((s) => ({
      name: s.name,
      role: s.role,
      orders: s.orders,
      revenue: Number(s.revenue) || 0,
      avgOrderValue: Number(s.avgOrderValue) || 0,
      covers: s.covers,
      avatar: '',
      color: '#f59e0b',
    })));

    const payments = colorizePayments(data.paymentBreakdown);
    setPaymentBreakdown(payments);

    const zRows = mapZoneRevenueRows(data.zoneRevenue, zones);
    setZoneRevenue(zRows);
    setZoneOptions(zRows.map((z) => ({ zoneId: z.zoneId, zone: z.zone, color: z.color })));
    setSelectedZone((prev) => {
      if (prev === 'all') return prev;
      if (zRows.some((z) => z.zoneId === prev)) return prev;
      return 'all';
    });
  };

  const loadZones = async () => {
    if (zonesRef.current.length > 0) return zonesRef.current;
    const zones = await zonesApi.list().catch(() => [] as ZoneData[]);
    zonesRef.current = zones ?? [];
    return zonesRef.current;
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await dashboardApi.full();
      setDashboard(data);
      setDashError(null);
    } catch (err) {
      setDashError(err instanceof Error ? err.message : 'Failed to load live floor data');
      setDashboard(EMPTY_DASHBOARD);
    }
  }, []);

  /** Total KPIs + total chart + summary panels (payments, zones list, staff, items). */
  const fetchTotalAnalytics = async (
    nextPreset: DatePreset,
    from: string,
    to: string,
    nextGranularity: RevenueGranularity,
    tz: string,
  ) => {
    setLoading(true);
    try {
      const query = buildQuery(nextPreset, from, to, tz);
      const seriesQuery = buildQuery(nextPreset, from, to, tz, {
        granularity: toApiGranularity(nextGranularity),
      });

      const [zones, summary, series] = await Promise.all([
        loadZones(),
        analyticsApi.summary(query),
        analyticsApi.revenueSeries(seriesQuery).catch(() => [] as AnalyticsRevenueSeriesPoint[]),
      ]);

      let seriesRows = series ?? [];
      if (seriesRows.length === 0 && nextGranularity === 'hourly') {
        seriesRows = (summary.hourlyRevenue ?? []).map((h) => ({
          key: String(h.hour),
          label: formatHourFull(h.hour),
          revenue: Number(h.revenue) || 0,
          orders: Number(h.orders) || 0,
          byZone: [],
        }));
      }

      applySummaryPanels(summary, zones);
      setChartData(mapSeriesToChart(seriesRows, nextGranularity));

      // If summary omitted payment/zone, try dedicated dated endpoints
      if (!(summary.paymentBreakdown?.length)) {
        const pay = await analyticsApi.paymentBreakdown(query).catch(() => [] as PaymentBreakdown[]);
        if (pay.length) setPaymentBreakdown(colorizePayments(pay));
      }
      if (!(summary.zoneRevenue?.length)) {
        const zr = await analyticsApi.zoneRevenue(query).catch(() => [] as AnalyticsZoneRevenue[]);
        if (zr.length) {
          const zRows = mapZoneRevenueRows(zr, zones);
          setZoneRevenue(zRows);
          setZoneOptions(zRows.map((z) => ({ zoneId: z.zoneId, zone: z.zone, color: z.color })));
        }
      }
    } catch {
      setChartData([]);
      setTopItems([]);
      setTurnover([]);
      setStaffPerf([]);
      setPaymentBreakdown([]);
      setZoneRevenue([]);
      setTotalRevenue(0);
      setTotalOrders(0);
      setAvgOrderValue(0);
      setTotalCovers(0);
    } finally {
      setLoading(false);
    }
  };

  /** Zone time series — same from/to/timezone as Total. */
  const fetchZoneAnalytics = async (
    nextPreset: DatePreset,
    from: string,
    to: string,
    nextZoneGranularity: RevenueGranularity,
    tz: string,
    zoneId: string,
  ) => {
    setZoneLoading(true);
    try {
      const seriesQuery = buildQuery(nextPreset, from, to, tz, {
        granularity: toApiGranularity(nextZoneGranularity),
        ...(zoneId !== 'all' ? { zoneId } : {}),
      });
      const series = await analyticsApi.revenueSeries(seriesQuery).catch(() => [] as AnalyticsRevenueSeriesPoint[]);
      setZoneSeriesRaw(series ?? []);
    } catch {
      setZoneSeriesRaw([]);
    } finally {
      setZoneLoading(false);
    }
  };

  const refreshAll = () => {
    void fetchTotalAnalytics(preset, pickerRange.from, pickerRange.to, granularity, timezone);
    void fetchZoneAnalytics(preset, pickerRange.from, pickerRange.to, zoneGranularity, timezone, selectedZone);
    void fetchDashboard();
  };

  const applyPreset = (id: Exclude<DatePreset, 'custom'>) => {
    const next = presetToRange(id, timezone);
    setPreset(id);
    setPickerRange(next);
    void fetchTotalAnalytics(id, next.from, next.to, granularity, timezone);
    void fetchZoneAnalytics(id, next.from, next.to, zoneGranularity, timezone, selectedZone);
  };

  const applyCustomRange = (next: DateRangeValue) => {
    setPreset('custom');
    setPickerRange(next);
    void fetchTotalAnalytics('custom', next.from, next.to, granularity, timezone);
    void fetchZoneAnalytics('custom', next.from, next.to, zoneGranularity, timezone, selectedZone);
  };

  /** Changing Total granularity also syncs the shared date window for Zone. */
  const applyGranularity = (next: RevenueGranularity) => {
    setGranularity(next);
    const nextRange = rangeForGranularity(next, timezone);
    setPreset('custom');
    setPickerRange(nextRange);
    void fetchTotalAnalytics('custom', nextRange.from, nextRange.to, next, timezone);
    void fetchZoneAnalytics('custom', nextRange.from, nextRange.to, zoneGranularity, timezone, selectedZone);
  };

  /** Changing Zone granularity also syncs the shared date window for Total. */
  const applyZoneGranularity = (next: RevenueGranularity) => {
    setZoneGranularity(next);
    const nextRange = rangeForGranularity(next, timezone);
    setPreset('custom');
    setPickerRange(nextRange);
    void fetchTotalAnalytics('custom', nextRange.from, nextRange.to, granularity, timezone);
    void fetchZoneAnalytics('custom', nextRange.from, nextRange.to, next, timezone, selectedZone);
  };

  const handleSelectZone = (zoneId: string) => {
    setSelectedZone(zoneId);
    void fetchZoneAnalytics(preset, pickerRange.from, pickerRange.to, zoneGranularity, timezone, zoneId);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let tz = DEFAULT_TIMEZONE;
      try {
        const cfg = await configApi.get();
        if (cfg?.timezone) tz = String(cfg.timezone);
      } catch {
        /* keep default */
      }
      if (cancelled) return;
      setTimezone(tz);
      const today = venueTodayRange(tz);
      setPickerRange(today);
      void fetchTotalAnalytics('today', today.from, today.to, 'hourly', tz);
      void fetchZoneAnalytics('today', today.from, today.to, 'hourly', tz, 'all');
      void fetchDashboard();
    })();
    return () => { cancelled = true; };
    // Initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <TopNav onLockTerminal={() => setIsLocked(true)} />
      {isLocked && (
        <LockModal
          isOpen={isLocked}
          onClose={() => setIsLocked(false)}
          onUnlock={() => setIsLocked(false)}
        />
      )}

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-5">
        {/* Header + date range */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)' }}
            >
              <BarChart2 size={14} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h1 className="text-sm md:text-base font-bold text-foreground">Analytics</h1>
              <p className="text-[10px] md:text-xs text-muted-foreground">
                Live floor · Revenue · Zones · Payments · Staff · {timezone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
              {DATE_PRESETS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => applyPreset(r.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    preset === r.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <DateRangePicker
              value={pickerRange}
              onChange={applyCustomRange}
              className={preset === 'custom' ? 'border-cyan-500/40 bg-cyan-500/10' : ''}
            />

            <button
              type="button"
              onClick={refreshAll}
              className={`p-2 rounded-xl border border-border bg-muted/20 text-muted-foreground hover:text-foreground transition-all ${loading ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {dashError ? (
          <p className="text-sm text-rose-400 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2">
            {dashError}
          </p>
        ) : null}

        {/* KPI Cards — from summary totals */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${totalOrders} closed checks`, icon: <DollarSign size={16} />, color: '#06b6d4' },
            { label: 'Avg Order Value', value: `$${avgOrderValue.toFixed(2)}`, sub: 'per closed check', icon: <TrendingUp size={16} />, color: '#10b981' },
            { label: viewCopy.peakLabel, value: peakPoint.revenue > 0 ? (peakPoint.fullLabel || peakPoint.label) : '—', sub: `$${peakPoint.revenue.toLocaleString()}`, icon: <Clock size={16} />, color: '#f59e0b' },
            { label: 'Total Covers', value: totalCovers.toString(), sub: 'guests served', icon: <Users size={16} />, color: '#a855f7' },
            { label: 'Active Tables', value: String(dashboard.activeTables ?? 0), sub: 'open now', icon: <MapPin size={16} />, color: '#ec4899' },
            { label: 'Awaiting Bill', value: String(dashboard.awaitingBill ?? 0), sub: 'ready to close', icon: <CreditCard size={16} />, color: '#64748b' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl p-4" style={{ background: `${kpi.color}08`, border: `1px solid ${kpi.color}20` }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: kpi.color }}>
                {kpi.icon}
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-xl md:text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Revenue Chart */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <div className="flex flex-col gap-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">{viewCopy.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {viewCopy.subtitle}
                  {` · ${pickerRange.from === pickerRange.to ? pickerRange.from : `${pickerRange.from} → ${pickerRange.to}`}`}
                  {peakPoint.revenue > 0 ? ` · peak ${peakPoint.fullLabel || peakPoint.label} · $${peakPoint.revenue.toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#22d3ee' }} />
                  Revenue
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-border bg-muted/20 w-fit">
              {REVENUE_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => applyGranularity(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    granularity === v.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          {chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No sales in this date range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }} barCategoryGap="22%">
                <defs>
                  <linearGradient id="hourlyBarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0e7490" stopOpacity={0.9} />
                  </linearGradient>
                  <linearGradient id="hourlyBarPeak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ecfeff" stopOpacity={1} />
                    <stop offset="45%" stopColor="#22d3ee" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.14)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  interval={axisTickInterval(chartData.length)}
                  minTickGap={12}
                  height={28}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={formatMoneyTick}
                />
                <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(6,182,212,0.07)' }} />
                <Bar
                  dataKey="revenue"
                  name="revenue"
                  radius={[8, 8, 2, 2]}
                  maxBarSize={48}
                >
                  {chartData.map((row) => (
                    <Cell
                      key={row.key}
                      fill={row.key === peakPoint.key ? 'url(#hourlyBarPeak)' : 'url(#hourlyBarFill)'}
                      opacity={row.revenue === 0 ? 0.2 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by Zone + Zone time series */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div
            className="lg:col-span-2 rounded-2xl p-5"
            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={15} style={{ color: '#f59e0b' }} />
              <div>
                <h2 className="text-sm font-bold text-foreground">Revenue by Zone</h2>
                <p className="text-[10px] text-muted-foreground">
                  {zoneOptions.length} floor zones
                  {` · ${pickerRange.from === pickerRange.to
                    ? pickerRange.from
                    : `${pickerRange.from} → ${pickerRange.to}`}`}
                  {zoneListTotal > 0 ? ` · $${zoneListTotal.toLocaleString()}` : ''}
                  {loading ? ' · loading…' : ''}
                </p>
              </div>
            </div>
            {zoneRevenue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No floor zones found. Check Zone Management.</p>
            ) : (
              <div className="space-y-3">
                {zoneRevenue.map((z) => (
                  <button
                    key={z.zoneId}
                    type="button"
                    onClick={() => handleSelectZone(z.zoneId)}
                    className={`w-full text-left rounded-xl p-1 -m-1 transition-colors ${
                      selectedZone === z.zoneId ? 'bg-muted/30' : 'hover:bg-muted/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 px-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: z.color }} />
                        <span className="text-xs md:text-sm text-foreground font-medium">{z.zone}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs md:text-sm font-semibold text-foreground">
                          ${z.revenue.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1.5 hidden sm:inline">
                          {z.orders} orders
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mx-1">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(z.revenue / maxZoneRevenue) * 100}%`,
                          background: z.color,
                        }}
                      />
                    </div>
                  </button>
                ))}
                <div className="pt-3 border-t border-border grid grid-cols-2 gap-2">
                  {zoneRevenue.map((z) => (
                    <div key={`${z.zoneId}-meta`} className="p-2.5 rounded-lg bg-muted/20 border border-border/50">
                      <p className="text-xs text-muted-foreground truncate">{z.zone}</p>
                      <p className="text-xs md:text-sm font-semibold text-foreground">{z.tables} tables with sales</p>
                      <p className="text-xs" style={{ color: z.color }}>{z.orders} orders</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className="lg:col-span-3 rounded-2xl p-5"
            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}
          >
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {selectedZone === 'all'
                        ? zoneViewCopy.title.replace('Revenue', 'Revenue by Zone')
                        : `${selectedZoneLabel} · ${zoneViewCopy.title}`}
                    </h2>
                    <p className="text-[10px] text-muted-foreground">
                      {zoneViewCopy.subtitle}
                      {` · ${pickerRange.from === pickerRange.to ? pickerRange.from : `${pickerRange.from} → ${pickerRange.to}`}`}
                      {` · ${selectedZoneOrders} orders`}
                      {selectedZoneTotal > 0 ? ` · $${selectedZoneTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}
                      {zonePeak.revenue > 0 ? ` · peak ${zonePeak.fullLabel || zonePeak.label}` : ''}
                      {zoneLoading ? ' · loading…' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => handleSelectZone('all')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedZone === 'all'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All Zones
                  </button>
                  {zoneOptions.map((z) => (
                    <button
                      key={z.zoneId}
                      type="button"
                      onClick={() => handleSelectZone(z.zoneId)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedZone === z.zoneId
                          ? 'border'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      style={
                        selectedZone === z.zoneId
                          ? { background: `${z.color}22`, color: z.color, borderColor: `${z.color}55` }
                          : undefined
                      }
                    >
                      {z.zone}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
                  {REVENUE_VIEWS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => applyZoneGranularity(v.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        zoneGranularity === v.id
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {zoneChartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {selectedZone === 'all'
                  ? 'No zone sales in this date range.'
                  : `No paid orders in ${selectedZoneLabel} for this date range.`}
              </p>
            ) : selectedZone === 'all' ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    key={`all-zones-${zoneGranularity}-${pickerRange.from}-${pickerRange.to}`}
                    data={zoneChartData}
                    barSize={zoneGranularity === 'hourly' ? 7 : 14}
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      interval={axisTickInterval(zoneChartData.length)}
                      minTickGap={12}
                      height={28}
                      tickMargin={8}
                    />
                    <YAxis
                      tick={{ fill: '#6b7280', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={formatMoneyTick}
                      width={42}
                    />
                    <Tooltip content={<ZoneHourlyTooltip />} />
                    {zoneSeriesKeys.map((s) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.zone}
                        fill={s.color}
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2">
                  {zoneSeriesKeys.map((l) => {
                    const total = zoneRevenue.find((z) => z.zoneId === l.zoneId)?.revenue ?? 0;
                    return (
                      <button
                        key={l.key}
                        type="button"
                        onClick={() => handleSelectZone(l.zoneId)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                        {l.zone}
                        <span className="text-foreground/70">${total.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  key={`zone-${selectedZone}-${zoneGranularity}-${pickerRange.from}-${pickerRange.to}`}
                  data={zoneChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.14)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    interval={axisTickInterval(zoneChartData.length)}
                    minTickGap={12}
                    height={28}
                    tickMargin={8}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tickFormatter={formatMoneyTick}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Bar dataKey="revenue" name="revenue" fill={selectedZoneColor} radius={[6, 6, 2, 2]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Items + Payment Methods + Table Turnover */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Award size={15} style={{ color: '#10b981' }} />
              <h2 className="text-sm font-bold text-foreground">Top Items Sold</h2>
            </div>
            <div className="space-y-2.5">
              {topItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No items in this date range.</p>
              ) : null}
              {topItems.slice(0, 6).map((item, i) => {
                const maxQty = topItems[0]?.qty || 1;
                const pct = (item.qty / maxQty) * 100;
                const catColor = CATEGORY_COLORS[item.category] ?? '#64748b';
                return (
                  <div key={`top-item-${i}-${item.category}-${item.name}`} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground truncate pr-2">{item.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                            style={{ background: `${catColor}15`, color: catColor }}
                          >
                            {item.category}
                          </span>
                          <span className="text-xs font-semibold text-foreground">{item.qty}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: catColor }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-14 text-right">${item.revenue.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={15} style={{ color: '#06b6d4' }} />
              <div>
                <h2 className="text-sm font-bold text-foreground">Payment Methods</h2>
                <p className="text-[10px] text-muted-foreground">Same date range as above</p>
              </div>
            </div>
            {paymentBreakdown.length === 0 || totalPayments === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={paymentBreakdown.filter((p) => Number(p.value) > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paymentBreakdown.filter((p) => Number(p.value) > 0).map((entry, index) => (
                        <Cell key={`pay-${entry.name}-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`$${Number(value).toLocaleString()}`, '']}
                      contentStyle={{
                        background: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(100,116,139,0.2)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {paymentBreakdown.map((p) => (
                    <div key={p.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-foreground">
                          ${Number(p.value).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1.5">
                          {totalPayments > 0 ? Math.round((Number(p.value) / totalPayments) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Repeat size={15} style={{ color: '#a855f7' }} />
              <h2 className="text-sm font-bold text-foreground">Table Turnover Rate</h2>
            </div>
            <div className="space-y-3">
              {turnover.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No turnover data in this date range.</p>
              ) : null}
              {turnover.map((zone) => (
                <div
                  key={zone.zoneId || zone.zone}
                  className="rounded-xl p-3.5"
                  style={{ background: `${zone.color}08`, border: `1px solid ${zone.color}20` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">{zone.zone}</span>
                    <span className="text-xs font-bold" style={{ color: zone.color }}>{zone.turns}x turns</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Avg Stay</p>
                      <p className="text-xs font-semibold text-foreground">{zone.avgMinutes}m</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                      <p className="text-xs font-semibold text-foreground">${zone.revenue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Rev/Turn</p>
                      <p className="text-xs font-semibold text-foreground">
                        ${zone.turns > 0 ? Math.round(zone.revenue / zone.turns).toLocaleString() : '0'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Staff Performance */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} style={{ color: '#f59e0b' }} />
            <h2 className="text-sm font-bold text-foreground">Staff Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  {['Staff', 'Role', 'Orders', 'Revenue', 'Avg Order', 'Covers'].map((h) => (
                    <th key={h} className="text-left pb-3 pr-4 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {staffPerf.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No staff performance in this date range.
                    </td>
                  </tr>
                ) : null}
                {staffPerf.map((s, i) => (
                  <tr key={`staff-row-${i}-${s.name}`} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        {i === 0 && <Star size={14} className="text-amber-400" />}
                        {i === 1 && <Star size={14} className="text-slate-400" />}
                        {i === 2 && <Star size={14} className="text-amber-700" />}
                        {i > 2 && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{ background: `${s.color}15`, color: s.color }}
                          >
                            {s.avatar || i + 1}
                          </span>
                        )}
                        <span className="font-semibold text-foreground">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                        style={{ background: `${s.color}12`, color: s.color }}
                      >
                        {s.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-foreground">{s.orders}</td>
                    <td className="py-3 pr-4 font-semibold text-foreground">${s.revenue.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-muted-foreground">${s.avgOrderValue.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{s.covers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {staffPerf.length > 0 ? (
            <div className="mt-5 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-3">Revenue by Staff Member</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={staffPerf} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatMoneyTick} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Bar dataKey="revenue" name="revenue" radius={[0, 4, 4, 0]}>
                    {staffPerf.map((s, i) => (
                      <Cell key={i} fill={s.color} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
