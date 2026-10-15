'use client';

import React, { useState, useEffect, useCallback } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import { TrendingUp, Users, DollarSign, BarChart3, RefreshCw, ArrowUpRight, ArrowDownRight, CreditCard, Star, Clock, MapPin,  } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,  } from 'recharts';
import { dashboardApi } from '@/lib/api/client';
import type { DashboardSummary } from '@/lib/api/types';

const EMPTY_SUMMARY: DashboardSummary = {
  zoneRevenue: [],
  topItems: [],
  paymentBreakdown: [],
  hourlyData: [],
  activeTables: 0,
  awaitingBill: 0,
};

const CATEGORY_COLORS: Record<string, string> = {
  Spirits: '#f59e0b',
  Cocktails: '#06b6d4',
  Wine: '#a855f7',
  Hookah: '#ec4899',
  Bites: '#10b981',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card-elevated rounded-lg border border-border p-3 text-xs shadow-xl">
        <p className="font-semibold text-foreground mb-1.5">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="text-foreground font-medium">${p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function ManagerDashboardPage() {
  const [isLocked, setIsLocked] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await dashboardApi.full();
      setSummary(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLastRefresh(new Date());
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const ZONE_REVENUE = summary.zoneRevenue ?? [];
  const TOP_ITEMS = summary.topItems ?? [];
  const PAYMENT_BREAKDOWN = summary.paymentBreakdown ?? [];
  const HOURLY_DATA = summary.hourlyData ?? [];

  const totalRevenue = ZONE_REVENUE.reduce((s, z) => s + z.revenue, 0);
  const totalGuests = ZONE_REVENUE.reduce((s, z) => s + z.guests, 0);
  const totalPayments = PAYMENT_BREAKDOWN.reduce((s, p) => s + p.value, 0);

  const handleRefresh = () => { fetchSummary(); };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setIsLocked(true)} />
      {isLocked && <LockModal isOpen={isLocked} onClose={() => setIsLocked(false)} onUnlock={() => setIsLocked(false)} />}

      <div className="max-w-7xl mx-auto px-3 md:px-4 lg:px-6 py-4 md:py-6 space-y-4 md:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <BarChart3 size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Manager Dashboard</h1>
              <p className="text-xs md:text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock size={12} />
                <span className="hidden sm:inline">Shift started 6:00 PM · </span>Last updated {formatTime(lastRefresh)}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm transition-all"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {loadError && (
          <p className="text-sm text-rose-400 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2">
            {loadError} — ensure Spring Boot exposes all <code className="text-xs">/api/dashboard/*</code> endpoints.
          </p>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          {[
            { label: 'Shift Revenue', value: `$${totalRevenue.toLocaleString()}`, sub: '+12% vs last shift', icon: <DollarSign size={16} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', up: true },
            { label: 'Total Guests', value: totalGuests.toString(), sub: '47 covers tonight', icon: <Users size={16} />, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', up: true },
            { label: 'Avg. Spend', value: totalGuests > 0 ? `$${(totalRevenue / totalGuests).toFixed(0)}` : '—', sub: 'Per cover', icon: <TrendingUp size={16} />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', up: true },
            { label: 'Active Tables', value: String(summary.activeTables), sub: `${summary.awaitingBill} awaiting bill`, icon: <MapPin size={16} />, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', up: false },
          ].map(kpi => (
            <div key={kpi.label} className={`glass-card rounded-xl border p-3 md:p-4 ${kpi.bg}`}>
              <div className="flex items-start justify-between mb-2">
                <span className={kpi.color}>{kpi.icon}</span>
                <span className={`flex items-center gap-0.5 text-xs font-medium ${kpi.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {kpi.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                </span>
              </div>
              <p className="text-xl md:text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Revenue by Zone + Hourly Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="lg:col-span-2 glass-card rounded-xl border border-border p-4 md:p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <MapPin size={14} className="text-muted-foreground" />
              Revenue by Zone
            </h3>
            <div className="space-y-2 md:space-y-3">
              {ZONE_REVENUE.sort((a, b) => b.revenue - a.revenue).map(z => (
                <div key={z.zone}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: z.color }} />
                      <span className="text-xs md:text-sm text-foreground font-medium">{z.zone}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs md:text-sm font-semibold text-foreground">${z.revenue.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1 md:ml-2 hidden sm:inline">{z.guests} guests</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(z.revenue / Math.max(...ZONE_REVENUE.map(r => r.revenue))) * 100}%`, background: z.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border grid grid-cols-2 gap-2 md:gap-3">
              {ZONE_REVENUE.map(z => (
                <div key={z.zone} className="p-2 md:p-2.5 rounded-lg bg-muted/20 border border-border/50">
                  <p className="text-xs text-muted-foreground truncate">{z.zone}</p>
                  <p className="text-xs md:text-sm font-semibold text-foreground">{z.tables} tables</p>
                  <p className="text-xs" style={{ color: z.color }}>{z.guests} guests</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 glass-card rounded-xl border border-border p-4 md:p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-muted-foreground" />
              Hourly Revenue by Zone
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={HOURLY_DATA} barSize={7} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={36} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="vip" name="VIP" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="bar" name="Bar" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                <Bar dataKey="terrace" name="Terrace" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cabana" name="Cabana" fill="#a855f7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 md:gap-3 mt-2">
              {[{ label: 'VIP', color: '#f59e0b' }, { label: 'Bar', color: '#06b6d4' }, { label: 'Terrace', color: '#10b981' }, { label: 'Cabana', color: '#a855f7' }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Items + Payment Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="lg:col-span-3 glass-card rounded-xl border border-border p-4 md:p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 md:mb-4 flex items-center gap-2">
              <Star size={14} className="text-muted-foreground" />
              Top Selling Items
            </h3>
            <div className="space-y-1.5 md:space-y-2">
              {TOP_ITEMS.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 md:gap-3 p-2 md:p-2.5 rounded-lg hover:bg-muted/20 transition-all">
                  <span className="w-5 md:w-6 h-5 md:h-6 rounded-md bg-muted/40 flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs hidden sm:block" style={{ color: CATEGORY_COLORS[item.category] || '#6b7280' }}>{item.category}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs md:text-sm font-semibold text-foreground">${item.revenue}</p>
                    <p className="text-xs text-muted-foreground hidden sm:block">{item.qty} sold</p>
                  </div>
                  <span className={`flex items-center text-xs font-medium ${item.trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Breakdown — keep existing JSX from original file */}
          <div className="lg:col-span-2 glass-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <CreditCard size={14} className="text-muted-foreground" />
              Payment Methods
            </h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={PAYMENT_BREAKDOWN} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {PAYMENT_BREAKDOWN.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, '']} contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {PAYMENT_BREAKDOWN.map(p => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="text-xs text-muted-foreground">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-foreground">${p.value.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">{totalPayments > 0 ? Math.round((p.value / totalPayments) * 100) : 0}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
