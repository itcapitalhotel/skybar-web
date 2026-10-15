'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import {
  Package, AlertTriangle, TrendingDown, CheckCircle, Search, Save, RotateCcw,
  Plus, Minus, History, ClipboardList, X, ChevronDown, ChevronUp,
  ArrowDownCircle, ArrowUpCircle, Clock, RefreshCw, FileCheck,
} from 'lucide-react';
import { shiftApi, stockApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';
import type { StockHistoryEntry, StockItem } from '@/lib/api/types';
import Icon from '@/components/ui/AppIcon';


const CATEGORIES = ['All', 'Spirits', 'Liqueurs', 'Wine & Sparkling', 'Beer', 'Mixers', 'Consumables'];

function getStockStatus(item: StockItem): 'critical' | 'low' | 'ok' | 'full' {
  const ratio = item.currentStock / item.reorderThreshold;
  if (item.currentStock === 0) return 'critical';
  if (ratio < 0.5) return 'critical';
  if (item.currentStock <= item.reorderThreshold) return 'low';
  const cap = item.maxCapacity ?? item.maxStock;
  if (cap != null && item.currentStock >= cap * 0.9) return 'full';
  return 'ok';
}

const STATUS_CONFIG = {
  critical: { label: 'Critical', color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30', bar: 'bg-rose-500' },
  low: { label: 'Low', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30', bar: 'bg-amber-500' },
  ok: { label: 'OK', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
  full: { label: 'Full', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', bar: 'bg-cyan-500' },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReconciliationItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  systemCount: number;
  actualCount: number | '';
  variance: number;
  status: 'critical' | 'low' | 'ok' | 'full';
}

const USAGE_TYPE_CONFIG = {
  consumed: { label: 'Consumed', color: 'text-rose-400', bg: 'bg-rose-500/10', icon: ArrowDownCircle },
  restocked: { label: 'Restocked', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: ArrowUpCircle },
  adjusted: { label: 'Adjusted', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: RefreshCw },
  reconciled: { label: 'Reconciled', color: 'text-cyan-400', bg: 'bg-cyan-500/10', icon: FileCheck },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Usage History Panel ──────────────────────────────────────────────────────
function UsageHistoryPanel({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const status = getStockStatus(item);
  const conf = STATUS_CONFIG[status];

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    stockApi.history(item.id, { limit: 50 })
      .then(data => { if (!cancelled) { setEntries(data); setHistoryError(null); } })
      .catch(err => { if (!cancelled) { setEntries([]); setHistoryError(err.message ?? 'Failed to load history'); } })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
              <History size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{item.name}</h2>
              <p className="text-xs text-muted-foreground font-mono">{item.sku} · {item.unit}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Current Status */}
        <div className="px-5 py-3 border-b border-border bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Current Stock</p>
                <p className={`text-2xl font-bold tabular-nums ${conf.color}`}>{item.currentStock}</p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Threshold</p>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{item.reorderThreshold}</p>
              </div>
              <div className="w-px h-10 bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">Max</p>
                <p className="text-2xl font-bold tabular-nums text-muted-foreground">{item.maxCapacity}</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${conf.bg} ${conf.color} ${conf.border}`}>
              {conf.label}
            </span>
          </div>
          <div className="mt-2 w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div className={`h-full rounded-full ${conf.bar}`} style={{ width: `${Math.min(100, (item.currentStock / item.maxCapacity) * 100)}%` }} />
          </div>
        </div>

        {/* Usage History */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage History</p>
          </div>
          <div className="divide-y divide-border/50">
            {historyLoading && (
              <p className="px-5 py-8 text-sm text-muted-foreground text-center">Loading history…</p>
            )}
            {!historyLoading && historyError && (
              <p className="px-5 py-8 text-sm text-rose-400 text-center">{historyError}</p>
            )}
            {!historyLoading && !historyError && entries.length === 0 && (
              <p className="px-5 py-8 text-sm text-muted-foreground text-center">No usage history yet.</p>
            )}
            {!historyLoading && entries.map(entry => {
              const typeConf = USAGE_TYPE_CONFIG[entry.type];
              const Icon = typeConf.icon;
              return (
                <div key={entry.id} className="px-5 py-3.5 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${typeConf.bg}`}>
                      <Icon size={13} className={typeConf.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${typeConf.color}`}>{typeConf.label}</span>
                        <span className={`text-sm font-bold tabular-nums ${entry.quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{entry.previousStock} → {entry.newStock} {item.unit}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{entry.updatedBy}</span>
                      </div>
                      {entry.note && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{entry.note}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={10} className="text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground/60">{formatTime(entry.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── End-of-Shift Reconciliation Modal ───────────────────────────────────────
function ReconciliationModal({ stock, onClose, onSubmit }: {
  stock: StockItem[];
  onClose: () => void;
  onSubmit: (items: ReconciliationItem[], note: string) => void;
}) {
  const [items, setItems] = useState<ReconciliationItem[]>(
    stock.map(s => ({
      id: s.id,
      name: s.name,
      sku: s.sku,
      unit: s.unit,
      systemCount: s.currentStock,
      actualCount: '',
      variance: 0,
      status: getStockStatus(s),
    }))
  );
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'entry' | 'review' | 'done'>('entry');
  const [searchRec, setSearchRec] = useState('');
  const [showOnlyVariance, setShowOnlyVariance] = useState(false);

  const handleActualChange = (id: string, val: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const actual = val === '' ? '' : Math.max(0, parseInt(val) || 0);
      const variance = actual === '' ? 0 : (actual as number) - item.systemCount;
      return { ...item, actualCount: actual, variance };
    }));
  };

  const filledCount = items.filter(i => i.actualCount !== '').length;
  const varianceItems = items.filter(i => i.actualCount !== '' && i.variance !== 0);
  const totalVariance = varianceItems.reduce((sum, i) => sum + Math.abs(i.variance), 0);

  const filteredRec = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(searchRec.toLowerCase()) || i.sku.toLowerCase().includes(searchRec.toLowerCase());
    const matchVariance = !showOnlyVariance || (i.actualCount !== '' && i.variance !== 0);
    return matchSearch && matchVariance;
  });

  const handleSubmit = () => {
    onSubmit(items.filter(i => i.actualCount !== ''), note);
    setStep('done');
  };

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <FileCheck size={28} className="text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Reconciliation Complete</h2>
          <p className="text-sm text-muted-foreground mb-1">{filledCount} items reconciled</p>
          <p className="text-sm text-muted-foreground mb-6">{varianceItems.length} items had variance · Total Δ {totalVariance}</p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Review Variances</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{varianceItems.length} items with discrepancies</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {varianceItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <CheckCircle size={28} className="text-emerald-400 mx-auto mb-2" />
                <p>No variances — all counts match system records!</p>
              </div>
            ) : (
              varianceItems.map(item => (
                <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${item.variance < 0 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">System: <span className="text-foreground font-medium">{item.systemCount}</span> → Actual: <span className="text-foreground font-medium">{item.actualCount}</span></p>
                    <p className={`text-sm font-bold tabular-nums ${item.variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {item.variance > 0 ? '+' : ''}{item.variance} {item.unit}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-5 py-4 border-t border-border space-y-3">
            <textarea
              placeholder="Reconciliation note (optional)..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none transition-all"
            />
            <div className="flex gap-2">
              <button onClick={() => setStep('entry')} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                Back
              </button>
              <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
                Confirm & Sync
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step: entry
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
              <ClipboardList size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">End-of-Shift Reconciliation</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Enter actual counts to sync with system records</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Progress */}
        <div className="px-5 py-3 border-b border-border bg-muted/10 flex items-center gap-4">
          <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${items.length > 0 ? (filledCount / items.length) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">{filledCount} / {items.length} counted</span>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-border flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchRec}
              onChange={e => setSearchRec(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>
          <button
            onClick={() => setShowOnlyVariance(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all flex-shrink-0 ${showOnlyVariance ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
          >
            <AlertTriangle size={12} />
            Variances only
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1.5fr_1fr] gap-4 px-5 py-2.5 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Item</span>
            <span>Unit</span>
            <span>System</span>
            <span>Actual Count</span>
            <span>Variance</span>
          </div>
          <div className="divide-y divide-border/50">
            {filteredRec.map(item => {
              const hasVariance = item.actualCount !== '' && item.variance !== 0;
              return (
                <div key={item.id} className={`px-5 py-3 hover:bg-muted/10 transition-colors ${hasVariance ? (item.variance < 0 ? 'bg-rose-500/3' : 'bg-emerald-500/3') : ''}`}>
                  {/* Mobile */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      </div>
                      {item.actualCount !== '' && (
                        <span className={`text-sm font-bold tabular-nums ${item.variance === 0 ? 'text-emerald-400' : item.variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {item.variance === 0 ? '✓' : (item.variance > 0 ? '+' : '')}{item.variance !== 0 ? item.variance : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">System: <span className="text-foreground font-medium">{item.systemCount}</span></span>
                      <input
                        type="number"
                        min={0}
                        placeholder="Actual..."
                        value={item.actualCount}
                        onChange={e => handleActualChange(item.id, e.target.value)}
                        className="w-24 text-center py-1.5 rounded-lg bg-muted/40 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1.5fr_1fr] gap-4 items-center">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                    <span className="text-sm font-medium text-foreground tabular-nums">{item.systemCount}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Enter count..."
                      value={item.actualCount}
                      onChange={e => handleActualChange(item.id, e.target.value)}
                      className="w-full py-1.5 px-3 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
                    />
                    <span className={`text-sm font-bold tabular-nums ${item.actualCount === '' ? 'text-muted-foreground/30' : item.variance === 0 ? 'text-emerald-400' : item.variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {item.actualCount === '' ? '—' : item.variance === 0 ? '✓ 0' : (item.variance > 0 ? '+' : '') + item.variance}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 bg-muted/10">
          <div className="text-xs text-muted-foreground">
            {varianceItems.length > 0 && (
              <span className="text-amber-400 font-medium">{varianceItems.length} variance{varianceItems.length !== 1 ? 's' : ''} detected</span>
            )}
            {varianceItems.length === 0 && filledCount > 0 && (
              <span className="text-emerald-400 font-medium">All counts match ✓</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
              Cancel
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={filledCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40"
            >
              <ChevronDown size={14} />
              Review & Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StockManagementPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [draftStock, setDraftStock] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'all' | 'critical' | 'low'>('all');
  const [bulkMode, setBulkMode] = useState(false);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [reconciliationDone, setReconciliationDone] = useState(false);

  // ── Fetch stock from API ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    stockApi.list()
      .then(data => { if (!cancelled) { setStock(data); setApiError(null); } })
      .catch(err => { if (!cancelled) setApiError(err.message ?? 'Failed to load stock') })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = stock.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || item.category === category;
    const status = getStockStatus(item);
    const matchStatus = filterStatus === 'all' || status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  const criticalCount = stock.filter(i => getStockStatus(i) === 'critical').length;
  const lowCount = stock.filter(i => getStockStatus(i) === 'low').length;
  const totalValue = stock.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0);

  const handleDraftChange = (id: string, val: number) => {
    setDraftStock(prev => ({ ...prev, [id]: Math.max(0, val) }));
  };

  const handleSaveItem = async (id: string) => {
    if (draftStock[id] === undefined) return;
    try {
      const updated = await stockApi.updateCount(id, { currentStock: draftStock[id] });
      setStock(prev => prev.map(i => i.id === id ? updated : i));
      setApiError(null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update stock count');
    }
    setSavedItems(prev => new Set([...prev, id]));
    setTimeout(() => setSavedItems(prev => { const n = new Set(prev); n.delete(id); return n; }), 2000);
  };

  const handleBulkSave = async () => {
    const updates = Object.entries(draftStock).map(([id, currentStock]) => ({ id, currentStock }));
    try {
      const updatedItems = await stockApi.bulkUpdate({ updates });
      const updatedMap = Object.fromEntries(updatedItems.map(i => [i.id, i]));
      setStock(prev => prev.map(i => updatedMap[i.id] ?? i));
      setApiError(null);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to bulk update stock');
    }
    setDraftStock({});
    setBulkMode(false);
  };

  const handleBulkReset = () => {
    setDraftStock({});
  };

  const handleReconciliationSubmit = async (items: ReconciliationItem[], note: string) => {
    const counted = items.filter(i => i.actualCount !== '');
    if (counted.length === 0) return;
    try {
      const shift = await shiftApi.current();
      const user = getAuthUser();
      const result = await stockApi.reconcile({
        shiftId: shift.shiftId,
        reconciledBy: user?.id ?? user?.name ?? 'unknown',
        note: note || undefined,
        items: counted.map(i => ({ stockItemId: i.id, actualCount: i.actualCount as number })),
      });
      const updatesMap = Object.fromEntries(
        result.summary.map(s => [s.stockItemId, s.actualCount]),
      );
      setStock(prev => prev.map(s => updatesMap[s.id] !== undefined ? { ...s, currentStock: updatesMap[s.id] } : s));
      setApiError(null);
      setReconciliationDone(true);
      setTimeout(() => setReconciliationDone(false), 4000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Reconciliation failed');
    }
  };

  const draftCount = Object.keys(draftStock).length;
  const alertItems = stock.filter(i => getStockStatus(i) === 'critical' || getStockStatus(i) === 'low');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav onLockTerminal={() => setLockOpen(true)} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => setLockOpen(false)} />

      {/* Usage History Panel */}
      {historyItem && <UsageHistoryPanel item={historyItem} onClose={() => setHistoryItem(null)} />}

      {/* Reconciliation Modal */}
      {showReconciliation && (
        <ReconciliationModal
          stock={stock}
          onClose={() => setShowReconciliation(false)}
          onSubmit={handleReconciliationSubmit}
        />
      )}

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {/* API Error Banner */}
        {apiError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
            <AlertTriangle size={13} />
            <span>API unavailable — showing cached data. ({apiError})</span>
          </div>
        )}

        {/* Reconciliation Success Banner */}
        {reconciliationDone && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
            <FileCheck size={13} />
            <span>End-of-shift reconciliation complete — stock counts synced with system records.</span>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Package size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Stock Management</h1>
              <p className="text-xs text-muted-foreground">Daily inventory counts, alerts & reconciliation</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {draftCount > 0 && (
              <button onClick={handleBulkReset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                <RotateCcw size={13} />
                Reset ({draftCount})
              </button>
            )}
            <button
              onClick={() => setBulkMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${bulkMode ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
            >
              <Package size={13} />
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Entry'}
            </button>
            {bulkMode && draftCount > 0 && (
              <button onClick={handleBulkSave} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all">
                <Save size={13} />
                Save All ({draftCount})
              </button>
            )}
            <button
              onClick={() => setShowReconciliation(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/25 transition-all"
            >
              <ClipboardList size={13} />
              End-of-Shift Reconciliation
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-rose-400" />
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
            <p className="text-2xl font-bold text-rose-400">{loading ? '—' : criticalCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">items need urgent reorder</p>
          </div>
          <div className="glass-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-amber-400" />
              <span className="text-xs text-muted-foreground">Low Stock</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{loading ? '—' : lowCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">items below threshold</p>
          </div>
          <div className="glass-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-xs text-muted-foreground">Well Stocked</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{loading ? '—' : stock.filter(i => getStockStatus(i) === 'ok' || getStockStatus(i) === 'full').length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">items at good levels</p>
          </div>
          <div className="glass-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package size={14} className="text-cyan-400" />
              <span className="text-xs text-muted-foreground">Stock Value</span>
            </div>
            <p className="text-2xl font-bold text-cyan-400">{loading ? '—' : `$${totalValue.toLocaleString()}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">estimated on-hand value</p>
          </div>
        </div>

        {/* Low-Stock Alerts Panel */}
        {!loading && alertItems.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
            <button
              onClick={() => setAlertsExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-500/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">
                  Low-Stock Alerts — {alertItems.length} item{alertItems.length !== 1 ? 's' : ''} need attention
                </span>
                {criticalCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                    {criticalCount} Critical
                  </span>
                )}
              </div>
              {alertsExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
            </button>
            {alertsExpanded && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {alertItems.map(item => {
                  const status = getStockStatus(item);
                  const conf = STATUS_CONFIG[status];
                  const pct = Math.min(100, (item.currentStock / item.maxCapacity) * 100);
                  return (
                    <div key={`alert-card-${item.id}`} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${conf.bg} ${conf.border}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className={`text-xs font-semibold truncate ${conf.color}`}>{item.name}</p>
                          <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${conf.color}`}>{item.currentStock}/{item.reorderThreshold}</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-muted/60 overflow-hidden">
                          <div className={`h-full rounded-full ${conf.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{item.unit} · threshold {item.reorderThreshold}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search items or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'critical', 'low'] as const).map(s => (
              <button
                key={`filter-${s}`}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${filterStatus === s ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
              >
                {s === 'all' ? 'All Items' : s === 'critical' ? `🔴 Critical (${criticalCount})` : `🟡 Low (${lowCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none mb-5 pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={`cat-${cat}`}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${category === cat ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Stock Table */}
        <div className="glass-card-elevated rounded-xl border border-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Item / SKU</span>
            <span>Category</span>
            <span>Status</span>
            <span>Current</span>
            <span>Threshold</span>
            <span>Max</span>
            <span>{bulkMode ? 'New Count' : 'Stock Level'}</span>
            <span>History</span>
          </div>

          <div className="divide-y divide-border">
            {loading && (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading stock data…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">No items match your filters.</div>
            )}
            {!loading && filtered.map(item => {
              const status = getStockStatus(item);
              const conf = STATUS_CONFIG[status];
              const pct = Math.min(100, (item.currentStock / item.maxCapacity) * 100);
              const draft = draftStock[item.id];
              const hasDraft = draft !== undefined;
              const isSaved = savedItems.has(item.id);

              return (
                <div key={item.id} className={`px-4 md:px-5 py-4 hover:bg-muted/10 transition-colors ${status === 'critical' ? 'bg-rose-500/3' : ''}`}>
                  {/* Mobile Layout */}
                  <div className="md:hidden space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${conf.bg} ${conf.color} ${conf.border}`}>
                          {conf.label}
                        </span>
                        <button
                          onClick={() => setHistoryItem(item)}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all"
                        >
                          <History size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Current: <span className="text-foreground font-semibold">{item.currentStock}</span></span>
                      <span>Threshold: <span className="text-amber-400 font-semibold">{item.reorderThreshold}</span></span>
                      <span>Max: <span className="text-foreground">{item.maxCapacity}</span></span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${conf.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    {bulkMode && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDraftChange(item.id, (draft ?? item.currentStock) - 1)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                          <Minus size={13} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={draft ?? item.currentStock}
                          onChange={e => handleDraftChange(item.id, parseInt(e.target.value) || 0)}
                          className="w-20 text-center py-1.5 rounded-lg bg-muted/40 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
                        />
                        <button onClick={() => handleDraftChange(item.id, (draft ?? item.currentStock) + 1)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                          <Plus size={13} />
                        </button>
                        <button onClick={() => handleSaveItem(item.id)} disabled={!hasDraft} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 transition-all disabled:opacity-40">
                          {isSaved ? <CheckCircle size={12} /> : <Save size={12} />}
                          {isSaved ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1.5fr_auto] gap-4 items-center">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku} · {item.unit}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${conf.bg} ${conf.color} ${conf.border}`}>
                      {status === 'critical' && <AlertTriangle size={10} />}
                      {conf.label}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${status === 'critical' ? 'text-rose-400' : status === 'low' ? 'text-amber-400' : 'text-foreground'}`}>
                      {item.currentStock}
                    </span>
                    <span className="text-sm text-amber-400 font-medium tabular-nums">{item.reorderThreshold}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{item.maxCapacity}</span>
                    <div>
                      {bulkMode ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleDraftChange(item.id, (draft ?? item.currentStock) - 1)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={draft ?? item.currentStock}
                            onChange={e => handleDraftChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 text-center py-1 rounded-md bg-muted/40 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
                          />
                          <button onClick={() => handleDraftChange(item.id, (draft ?? item.currentStock) + 1)} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                            <Plus size={11} />
                          </button>
                          <button onClick={() => handleSaveItem(item.id)} disabled={!hasDraft} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 transition-all disabled:opacity-40">
                            {isSaved ? <CheckCircle size={11} /> : <Save size={11} />}
                            {isSaved ? 'Saved' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden min-w-[60px]">
                            <div className={`h-full rounded-full transition-all ${conf.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{Math.round(pct)}%</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setHistoryItem(item)}
                      className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all"
                      title="View usage history"
                    >
                      <History size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {bulkMode && (
          <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs text-muted-foreground">
            <span className="text-primary font-medium">Bulk Entry Mode:</span> Update stock counts for each item, then click <span className="text-primary font-medium">Save All</span> to commit all changes at once. Individual <span className="text-primary font-medium">Save</span> buttons update one item at a time.
          </div>
        )}
      </main>
    </div>
  );
}
