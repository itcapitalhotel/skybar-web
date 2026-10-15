'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, TrendingUp, BarChart2, Users, Clock, Calendar,
  ChevronDown, RefreshCw, DollarSign, Repeat, Award
} from 'lucide-react';
import { analyticsApi } from '@/lib/api/client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface HourlyRevenue {
  hour: string;
  revenue: number;
  orders: number;
}

interface TopItem {
  name: string;
  qty: number;
  revenue: number;
  category: string;
}

interface TableTurnover {
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

type DateRange = 'today' | 'yesterday' | '7d' | '30d';

const DATE_RANGES: { id: DateRange; label: string }[] = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d',        label: 'Last 7 Days' },
  { id: '30d',       label: 'Last 30 Days' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Cocktails: '#f59e0b',
  Food:      '#10b981',
  Bottles:   '#a855f7',
  Beer:      '#06b6d4',
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs shadow-2xl" style={{ background: 'rgba(10,18,35,0.95)', border: '1px solid rgba(100,116,139,0.2)' }}>
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name === 'revenue' ? `$${p.value.toLocaleString()}` : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [loading, setLoading] = useState(false);
  const [hourlyData, setHourlyData] = useState<HourlyRevenue[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [turnover, setTurnover] = useState<TableTurnover[]>([]);
  const [staffPerf, setStaffPerf] = useState<StaffPerformance[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const totalRevenue = hourlyData.reduce((a, h) => a + h.revenue, 0);
  const totalOrders = hourlyData.reduce((a, h) => a + h.orders, 0);
  const peakHour = hourlyData.length > 0 ? hourlyData.reduce((a, h) => h.revenue > a.revenue ? h : a, hourlyData[0]) : { hour: '-', revenue: 0, orders: 0 };
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const fetchAnalytics = async (range: DateRange) => {
    setLoading(true);
    try {
      const data = await analyticsApi.summary({
        range,
        from: range === 'custom' ? customStart : undefined,
        to: range === 'custom' ? customEnd : undefined,
      });
      setHourlyData(data.hourlyRevenue);
      setTopItems(data.topItems.map(i => ({ name: i.name, qty: i.qty, revenue: i.revenue, category: i.category })));
      setTurnover(data.tableTurnover.map(t => ({ ...t, color: '#06b6d4' })));
      setStaffPerf(data.staffPerformance.map(s => ({ name: s.name, role: s.role, orders: s.orders, revenue: s.revenue, avgOrderValue: s.avgOrderValue, covers: s.covers })));
    } catch {
      setHourlyData([]);
      setTopItems([]);
      setTurnover([]);
      setStaffPerf([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(dateRange);
  }, [dateRange]);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(100,116,139,0.15)', backdropFilter: 'blur(20px)' }} className="sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ArrowLeft size={16} />
            <span className="text-sm hidden sm:inline">Back to Floor</span>
          </Link>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 md:w-8 h-7 md:h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)' }}>
              <BarChart2 size={14} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-foreground">Analytics</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Revenue · Items · Turnover · Staff</p>
            </div>
          </div>

          {/* Date Range */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
              {DATE_RANGES.map(r => (
                <button
                  key={r.id}
                  onClick={() => setDateRange(r.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    dateRange === r.id
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Custom Date Picker */}
            <div className="relative">
              <button
                onClick={() => setDatePickerOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-muted/20 text-muted-foreground hover:text-foreground hover:border-cyan-500/30 transition-all"
              >
                <Calendar size={12} />
                <span className="hidden sm:inline">Custom</span>
                <ChevronDown size={10} />
              </button>
              {datePickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl p-4 shadow-2xl z-50" style={{ background: 'rgba(10,18,35,0.98)', border: '1px solid rgba(100,116,139,0.2)' }}>
                  <p className="text-xs font-medium text-muted-foreground mb-3">Custom Date Range</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">From</label>
                      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="field-input mt-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">To</label>
                      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="field-input mt-1 text-xs" />
                    </div>
                    <button
                      onClick={() => { fetchAnalytics(dateRange); setDatePickerOpen(false); }}
                      className="w-full py-2 rounded-lg text-xs font-semibold mt-1 transition-all"
                      style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4' }}
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => fetchAnalytics(dateRange)}
              className={`p-2 rounded-xl border border-border bg-muted/20 text-muted-foreground hover:text-foreground transition-all ${loading ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, sub: `${totalOrders} orders`, icon: <DollarSign size={16} />, color: '#06b6d4' },
            { label: 'Avg Order Value', value: `$${avgOrderValue.toFixed(2)}`, sub: 'per transaction', icon: <TrendingUp size={16} />, color: '#10b981' },
            { label: 'Peak Hour', value: peakHour?.hour ?? '—', sub: `$${peakHour?.revenue.toLocaleString()}`, icon: <Clock size={16} />, color: '#f59e0b' },
            { label: 'Total Covers', value: staffPerf.reduce((a, s) => a + s.covers, 0).toString(), sub: 'guests served', icon: <Users size={16} />, color: '#a855f7' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-2xl p-4" style={{ background: `${kpi.color}08`, border: `1px solid ${kpi.color}20` }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: kpi.color }}>{kpi.icon}<span className="text-xs text-muted-foreground">{kpi.label}</span></div>
              <p className="text-xl md:text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Hourly Revenue Chart */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Hourly Revenue</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue and order volume by hour</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded bg-cyan-400 inline-block" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded bg-amber-400 inline-block" />Orders</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" />
              <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="rev" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="ord" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="rev" dataKey="revenue" name="revenue" fill="#06b6d4" radius={[4,4,0,0]} opacity={0.85} />
              <Bar yAxisId="ord" dataKey="orders" name="orders" fill="#f59e0b" radius={[4,4,0,0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Items + Table Turnover */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Top Items */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Award size={15} style={{ color: '#10b981' }} />
              <h2 className="text-sm font-bold text-foreground">Top Items Sold</h2>
            </div>
            <div className="space-y-2.5">
              {topItems.slice(0, 6).map((item, i) => {
                const maxQty = topItems[0].qty;
                const pct = (item.qty / maxQty) * 100;
                const catColor = CATEGORY_COLORS[item.category] ?? '#64748b';
                return (
                  <div key={`top-item-${i}-${item.category}-${item.name}`} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground truncate pr-2">{item.name}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: `${catColor}15`, color: catColor }}>{item.category}</span>
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

          {/* Table Turnover */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Repeat size={15} style={{ color: '#a855f7' }} />
              <h2 className="text-sm font-bold text-foreground">Table Turnover Rate</h2>
            </div>
            <div className="space-y-3">
              {turnover.map(zone => (
                <div key={zone.zone} className="rounded-xl p-3.5" style={{ background: `${zone.color}08`, border: `1px solid ${zone.color}20` }}>
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
                      <p className="text-xs font-semibold text-foreground">${Math.round(zone.revenue / zone.turns).toLocaleString()}</p>
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
                  {['Staff', 'Role', 'Orders', 'Revenue', 'Avg Order', 'Covers'].map(h => (
                    <th key={h} className="text-left pb-3 pr-4 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {staffPerf.map((s, i) => (
                  <tr key={`staff-row-${i}-${s.name}`} className="hover:bg-muted/10 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        {i === 0 && <span className="text-amber-400 text-base">🥇</span>}
                        {i === 1 && <span className="text-slate-400 text-base">🥈</span>}
                        {i === 2 && <span className="text-amber-700 text-base">🥉</span>}
                        {i > 2 && <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${s.color}15`, color: s.color }}>{s.avatar}</span>}
                        <span className="font-semibold text-foreground">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ background: `${s.color}12`, color: s.color }}>{s.role}</span>
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

          {/* Staff Revenue Bar Chart */}
          <div className="mt-5 pt-4 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-3">Revenue by Staff Member</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={staffPerf} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="revenue" radius={[0,4,4,0]}>
                  {staffPerf.map((s, i) => <Cell key={i} fill={s.color} opacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {datePickerOpen && <div className="fixed inset-0 z-40" onClick={() => setDatePickerOpen(false)} />}
    </div>
  );
}
