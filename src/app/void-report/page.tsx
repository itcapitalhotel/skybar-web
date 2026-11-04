'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import DateRangePicker, { todayRange } from '@/components/DateRangePicker';
import { ordersApi } from '@/lib/api/client';
import type { VoidReportLine } from '@/lib/api/types';
import { AlertCircle, RefreshCw, Ban } from 'lucide-react';

type TypeFilter = 'all' | 'food' | 'drink';

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineAmount(row: VoidReportLine): number {
  const qty = Number(row.qty ?? 0);
  const price = Number(row.unitPrice ?? 0);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return Math.round(qty * price * 100) / 100;
}

function staffLabel(row: VoidReportLine): string {
  const name = String(row.voidedByStaffName ?? '').trim();
  const id = String(row.voidedByStaffId ?? '').trim();
  if (name && id && name !== id) return `${name} (${id})`;
  return name || id || '—';
}

function orderStatusLabel(status?: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'active') return 'Open';
  return status?.trim() || '—';
}

export default function VoidReportPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [dateRange, setDateRange] = useState(todayRange);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [staffFilter, setStaffFilter] = useState('All');
  const [rows, setRows] = useState<VoidReportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await ordersApi.listVoids({ from: dateRange.from, to: dateRange.to });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setFetchError(err instanceof Error ? err.message : 'Could not load voided items');
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const staffOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) names.add(staffLabel(row));
    return ['All', ...Array.from(names).filter((n) => n !== '—').sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.categoryType !== typeFilter) return false;
      if (staffFilter !== 'All' && staffLabel(row) !== staffFilter) return false;
      return true;
    });
  }, [rows, typeFilter, staffFilter]);

  const totals = useMemo(() => {
    let foodQty = 0;
    let drinkQty = 0;
    let amount = 0;
    for (const row of filtered) {
      const qty = Number(row.qty ?? 0);
      if (row.categoryType === 'food') foodQty += qty;
      if (row.categoryType === 'drink') drinkQty += qty;
      amount += lineAmount(row);
    }
    return { count: filtered.length, foodQty, drinkQty, amount };
  }, [filtered]);

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
      <LockModal
        isOpen={lockOpen}
        onClose={() => setLockOpen(false)}
        onUnlock={() => { setLockOpen(false); setLocked(false); }}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Ban size={22} className="text-rose-400" />
              Void report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cancelled food and drink from open and paid orders — who voided each line, when, and why.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="field-input w-auto min-w-[8rem]"
              >
                <option value="all">All</option>
                <option value="food">Food</option>
                <option value="drink">Drink</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Cancelled by</label>
              <select
                value={staffOptions.includes(staffFilter) ? staffFilter : 'All'}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="field-input w-auto min-w-[10rem]"
              >
                {staffOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/25">
            <AlertCircle size={18} className="text-rose-400 shrink-0" />
            <p className="text-sm text-rose-400">{fetchError}</p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Voided lines" value={String(totals.count)} />
          <SummaryCard label="Food qty" value={String(totals.foodQty)} />
          <SummaryCard label="Drink qty" value={String(totals.drinkQty)} />
          <SummaryCard label="Voided amount" value={money(totals.amount)} />
        </div>

        <div className="glass-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Cancelled items — {filtered.length}
            </h2>
            <span className="text-xs text-muted-foreground">{dateRange.from} – {dateRange.to}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">When</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Table</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Order</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Item</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Qty</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Type</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Amount</th>
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Cancelled by</th>
                  <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">Loading voided items…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      No cancelled items for this date range.
                    </td>
                  </tr>
                ) : filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 text-foreground whitespace-nowrap">{fmtDateTime(row.voidedAt)}</td>
                    <td className="py-2.5 px-3 text-foreground">{row.tableLabel || row.tableId || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                      <span className="text-foreground">{row.orderId || '—'}</span>
                      <span className={`ml-2 inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                        row.orderStatus === 'paid'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                      }`}
                      >
                        {orderStatusLabel(row.orderStatus)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-foreground">
                      {row.name || '—'}
                      {row.size ? <span className="text-muted-foreground"> · {row.size}</span> : null}
                    </td>
                    <td className="text-right py-2.5 px-3 text-foreground">{row.qty}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium capitalize ${
                        row.categoryType === 'food'
                          ? 'text-orange-300 bg-orange-500/10 border-orange-500/25'
                          : row.categoryType === 'drink'
                            ? 'text-sky-300 bg-sky-500/10 border-sky-500/25'
                            : 'text-muted-foreground bg-muted/40 border-border'
                      }`}
                      >
                        {row.categoryType || '—'}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3 font-medium text-foreground">{money(lineAmount(row))}</td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap">{staffLabel(row)}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{row.voidReason?.trim() || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl border border-border px-4 py-3">
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      <p className="text-lg font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}
