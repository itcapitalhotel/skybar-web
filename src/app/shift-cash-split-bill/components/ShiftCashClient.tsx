'use client';

import React, { useState, useEffect, useCallback } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import SplitBillModal from '@/components/SplitBillModal';
import MergeTablesModal from '@/components/MergeTablesModal';
import { tablesApi, ordersApi } from '@/lib/api/client';
import type { TableData } from '@/lib/api/types';
import type { TableData as FloorTableData, OrderItem } from '@/app/components/floorData';
import {
  AlertCircle, SplitSquareHorizontal, ChevronRight, Merge, RefreshCw,
} from 'lucide-react';

type ActiveTab = 'split' | 'merge';

function apiTableToFloor(t: TableData): FloorTableData {
  const zone = t.zone.toLowerCase();
  const z = (['vip', 'bar', 'terrace', 'cabana'].includes(zone) ? zone : 'bar') as FloorTableData['zone'];
  return {
    id: t.id,
    label: t.label,
    zone: z,
    status: t.status as FloorTableData['status'],
    guests: t.guests,
    capacity: t.capacity,
    staff: t.staff,
    seatedMinutes: t.seatedMinutes,
    minSpend: t.minSpend,
    orderTotal: t.orderTotal,
    shape: t.shape as FloorTableData['shape'],
    x: t.x,
    y: t.y,
  };
}

export default function ShiftCashClient() {
  const [lockOpen, setLockOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('split');
  const [splitTableId, setSplitTableId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [floorTables, setFloorTables] = useState<TableData[]>([]);
  const [tableOrders, setTableOrders] = useState<Record<string, OrderItem[]>>({});
  const [tableOrderTotals, setTableOrderTotals] = useState<Record<string, number>>({});

  const loadFloor = useCallback(async () => {
    setLoading(true);
    try {
      const tables = await tablesApi.list();
      setFloorTables(tables);
      const orders: Record<string, OrderItem[]> = {};
      const totals: Record<string, number> = {};
      await Promise.all(
        tables
          .filter(t => t.status === 'occupied' || t.status === 'bill')
          .map(async t => {
            try {
              const order = await ordersApi.get(t.id);
              orders[t.id] = order.items;
              totals[t.id] = order.total;
            } catch {
              orders[t.id] = [];
            }
          }),
      );
      setTableOrders(orders);
      setTableOrderTotals(totals);
      setSplitTableId(prev => (prev && !tables.some(t => t.id === prev) ? null : prev));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFloor();
  }, [loadFloor]);

  const occupiedBillTables = floorTables.filter(t => t.status === 'occupied' || t.status === 'bill');
  const floorTableShapes = occupiedBillTables.map(apiTableToFloor);

  const splitTable = splitTableId ? floorTables.find(t => t.id === splitTableId) : null;
  const splitItems = splitTableId ? (tableOrders[splitTableId] || []).filter(i => i.status !== 'Voided') : [];
  const splitTotal = (() => {
    if (!splitTableId) return 0;
    const fromApi = tableOrderTotals[splitTableId];
    if (fromApi != null && Number.isFinite(fromApi)) return fromApi;
    return splitItems.reduce((a, i) => a + i.unitPrice * i.qty, 0) * 1.21;
  })();

  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'split', label: 'Split bill', icon: <SplitSquareHorizontal size={14} /> },
    { id: 'merge', label: 'Merge tables', icon: <Merge size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav onLockTerminal={() => { setLockOpen(true); setLocked(true); }} />

      {locked && !lockOpen && (
        <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center cursor-pointer" onClick={() => setLockOpen(true)}>
          <div className="glass-card-elevated rounded-2xl border border-border p-8 text-center">
            <p className="text-lg font-semibold text-foreground mb-1">Terminal Locked</p>
            <p className="text-sm text-muted-foreground">Tap to unlock</p>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-screen-2xl mx-auto w-full px-3 md:px-4 lg:px-6 xl:px-8 py-3 md:py-4 space-y-3 md:space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 md:w-9 h-8 md:h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <SplitSquareHorizontal size={16} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-foreground">Split &amp; merge bill</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Split checks by guest or combine tables into one bill
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadFloor()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh tables
          </button>
        </div>

        <div className="flex items-center gap-0.5 md:gap-1 border-b border-border pb-0 overflow-x-auto scrollbar-none">
          {TABS.map(tab => (
            <button
              key={`bill-tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'split' && (
          <div className="space-y-4 fade-in">
            <div className="glass-card rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                  <SplitSquareHorizontal size={16} className="text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Split bill</h2>
                  <p className="text-xs text-muted-foreground">Select an active table and split the check by guest or amount</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active tables</p>
              {loading && occupiedBillTables.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
              ) : occupiedBillTables.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No occupied tables — open a check on the floor map first.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {occupiedBillTables.map(t => {
                    const items = tableOrders[t.id] || [];
                    const total = items.reduce((a, i) => i.status !== 'Voided' ? a + i.unitPrice * i.qty : a, 0) * 1.21;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSplitTableId(t.id)}
                        className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-150 text-left ${
                          splitTableId === t.id
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                            : 'border-border hover:bg-muted/30 hover:border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{t.label}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${t.status === 'bill' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25' : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'}`}>
                            {t.status === 'bill' ? 'Bill' : 'Open'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.guests} guests</p>
                        {total > 0 && <p className="text-xs font-semibold text-foreground text-tabular">${total.toFixed(2)}</p>}
                      </button>
                    );
                  })}
                </div>
              )}

              {splitTableId && splitTable && (
                <div className="mt-5 pt-5 border-t border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">Table {splitTable.label}</p>
                      <p className="text-xs text-muted-foreground">{splitItems.length} items · ${splitTotal.toFixed(2)} total</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSplitOpen(true)}
                      disabled={splitItems.length === 0}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 transition-all disabled:opacity-40"
                    >
                      <SplitSquareHorizontal size={14} />
                      Open split bill
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {splitItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/20 border border-border">
                        <span className="text-foreground">{item.qty}× {item.name}</span>
                        <span className="text-muted-foreground text-tabular">${(item.unitPrice * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!splitTableId && occupiedBillTables.length > 0 && (
                <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
                  <SplitSquareHorizontal size={24} className="text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Select a table above to split the bill</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'merge' && (
          <div className="space-y-4 fade-in">
            <div className="glass-card rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                    <Merge size={16} className="text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Merge tables</h2>
                    <p className="text-xs text-muted-foreground">Combine multiple active tables into one combined order</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMergeOpen(true)}
                  disabled={occupiedBillTables.length < 2}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-40"
                >
                  <Merge size={14} />
                  Merge tables
                  <ChevronRight size={14} />
                </button>
              </div>

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active tables</p>
              {loading && occupiedBillTables.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
              ) : occupiedBillTables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Merge size={28} className="text-muted-foreground/25 mb-2" />
                  <p className="text-xs text-muted-foreground">No active tables to merge</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {occupiedBillTables.map(t => {
                    const items = tableOrders[t.id] || [];
                    const total = items.reduce((a, i) => i.status !== 'Voided' ? a + i.unitPrice * i.qty : a, 0) * 1.21;
                    return (
                      <div
                        key={t.id}
                        className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-muted/10 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{t.label}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${t.status === 'bill' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25' : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'}`}>
                            {t.status === 'bill' ? 'Bill' : 'Open'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.guests} guests</p>
                        {total > 0 && <p className="text-xs font-semibold text-foreground text-tabular">${total.toFixed(2)}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-border">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
                  <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                  <span>Merging combines all items from selected tables under one primary table. Other tables are freed after confirmation.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => { setLocked(false); setLockOpen(false); }} />

      {splitTable && (
        <SplitBillModal
          isOpen={splitOpen}
          onClose={() => setSplitOpen(false)}
          items={splitItems.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.unitPrice }))}
          total={splitTotal}
          tableId={splitTable.id}
          tableLabel={splitTable.label}
          onSplitComplete={() => void loadFloor()}
        />
      )}

      <MergeTablesModal
        isOpen={mergeOpen}
        onClose={() => setMergeOpen(false)}
        tables={floorTableShapes}
        tableOrders={tableOrders}
        onMerged={() => void loadFloor()}
      />
    </div>
  );
}
