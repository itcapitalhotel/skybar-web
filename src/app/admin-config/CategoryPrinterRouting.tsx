'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Link2, Plus, Save, Tag, Trash2, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { kitchenPrintersApi, menuCategoryApi } from '@/lib/api/client';
import type { CategoryKitchenPrinter, KitchenPrinter, MenuCategory } from '@/lib/api/types';
import { validatePrinterEndpoint } from '@/lib/printerValidate';
import {
  idlePingSlots,
  pingSummary,
  runTcpPrinterPingSeries,
  type PingSlot,
} from '@/lib/printerTcpTest';
import { PrinterPingIndicators } from '@/app/admin-config/PrinterPingIndicators';

type PrinterRow = CategoryKitchenPrinter & { rowKey: string };

function toRows(printers: CategoryKitchenPrinter[]): PrinterRow[] {
  return printers.map((p, i) => ({
    ...p,
    rowKey: p.id ?? `loaded-${i}-${p.printerIp}`,
  }));
}

function newEmptyRow(): PrinterRow {
  return {
    rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    printerIp: '',
    printerPort: 9100,
  };
}

function rowsToPayload(rows: PrinterRow[]): CategoryKitchenPrinter[] {
  return rows
    .filter((r) => r.name.trim() || r.printerIp.trim())
    .map(({ rowKey: _k, ...rest }) => {
      const out: CategoryKitchenPrinter = {
        name: rest.name.trim() || 'Printer',
        printerIp: rest.printerIp.trim(),
        printerPort: Number(rest.printerPort) || 9100,
      };
      if (rest.id) out.id = rest.id;
      return out;
    });
}

export function CategoryPrinterSettings({ reloadToken }: { reloadToken: number }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [pickerStations, setPickerStations] = useState<KitchenPrinter[]>([]);
  const [rowsByCategory, setRowsByCategory] = useState<Record<string, PrinterRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [rowPingSlots, setRowPingSlots] = useState<Record<string, PingSlot[]>>({});
  const [rowPingRunning, setRowPingRunning] = useState<Record<string, boolean>>({});
  const [rowPingDetail, setRowPingDetail] = useState<Record<string, string>>({});

  const rowPingKey = (categoryId: string, rowKey: string) => `${categoryId}:${rowKey}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, stations] = await Promise.all([
        menuCategoryApi.list(),
        kitchenPrintersApi.list().catch(() => [] as KitchenPrinter[]),
      ]);
      const active = cats.filter((c) => c.isActive !== false);
      setCategories(active);
      setPickerStations(stations);

      const entries = await Promise.all(
        active.map(async (cat) => {
          try {
            const res = await menuCategoryApi.getPrinters(cat.id);
            return [cat.id, toRows(res.printers ?? [])] as const;
          } catch {
            return [cat.id, [] as PrinterRow[]] as const;
          }
        }),
      );
      const map: Record<string, PrinterRow[]> = {};
      for (const [id, rows] of entries) map[id] = rows;
      setRowsByCategory(map);
    } catch {
      toast.error('Could not load category printers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, reloadToken]);

  const updateRow = (
    categoryId: string,
    rowKey: string,
    field: 'name' | 'printerIp' | 'printerPort',
    value: string,
  ) => {
    if (field === 'printerIp' || field === 'printerPort') {
      const key = rowPingKey(categoryId, rowKey);
      setRowPingSlots((prev) => ({ ...prev, [key]: idlePingSlots() }));
      setRowPingDetail((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setRowsByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).map((r) =>
        r.rowKey === rowKey
          ? { ...r, [field]: field === 'printerPort' ? Number(value) || 9100 : value }
          : r,
      ),
    }));
  };

  const addRow = (categoryId: string) => {
    setRowsByCategory((prev) => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] ?? []), newEmptyRow()],
    }));
  };

  const removeRow = (categoryId: string, rowKey: string) => {
    setRowsByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((r) => r.rowKey !== rowKey),
    }));
  };

  const applyPicker = (categoryId: string, stationId: string) => {
    if (!stationId) return;
    const station = pickerStations.find((s) => s.id === stationId);
    if (!station) return;
    setRowsByCategory((prev) => ({
      ...prev,
      [categoryId]: [
        ...(prev[categoryId] ?? []),
        {
          rowKey: `pick-${station.id}-${Date.now()}`,
          id: station.id,
          name: station.name,
          printerIp: station.printerIp,
          printerPort: station.printerPort,
        },
      ],
    }));
  };

  const handleTestRow = async (categoryId: string, row: PrinterRow) => {
    const key = rowPingKey(categoryId, row.rowKey);
    if (rowPingRunning[key]) return;
    const pre = validatePrinterEndpoint(row.printerIp, row.printerPort);
    if (!pre.ok) {
      toast.error(pre.error);
      setRowPingSlots((prev) => ({ ...prev, [key]: idlePingSlots().map(() => 'fail' as PingSlot) }));
      setRowPingDetail((prev) => ({ ...prev, [key]: pre.error }));
      return;
    }
    setRowPingRunning((prev) => ({ ...prev, [key]: true }));
    setRowPingDetail((prev) => ({ ...prev, [key]: '' }));
    setRowPingSlots((prev) => ({ ...prev, [key]: idlePingSlots() }));
    try {
      const ok = await runTcpPrinterPingSeries(row.printerIp, row.printerPort, (index, slot) => {
        setRowPingSlots((prev) => {
          const slots = [...(prev[key] ?? idlePingSlots())];
          slots[index] = slot;
          return { ...prev, [key]: slots };
        });
      }, (summary) => {
        setRowPingDetail((prev) => ({ ...prev, [key]: summary.lastMessage }));
        if (summary.okCount === 0) {
          toast.error(`${row.name || 'Printer'}: not reachable — ${summary.lastMessage}`);
        } else if (summary.okCount < 5) {
          toast.warning(`${row.name || 'Printer'}: ${summary.okCount}/5 TCP checks OK`);
        } else {
          toast.success(`${row.name || 'Printer'}: reachable`);
        }
      });
      if (!ok) {
        /* toast from onComplete */
      }
    } finally {
      setRowPingRunning((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveCategory = async (categoryId: string) => {
    const rows = rowsByCategory[categoryId] ?? [];
    const activeRows = rows.filter((r) => r.name.trim() || r.printerIp.trim());
    for (const row of activeRows) {
      const p = rowsToPayload([row])[0];
      if (!p) continue;
      const check = validatePrinterEndpoint(p.printerIp, p.printerPort);
      if (!check.ok) {
        toast.error(`${p.name}: ${check.error}`);
        return;
      }
      const key = rowPingKey(categoryId, row.rowKey);
      const slots = rowPingSlots[key];
      const tested = slots && !slots.every((s) => s === 'idle');
      const okHits = slots?.filter((s) => s === 'ok').length ?? 0;
      if (tested && okHits === 0) {
        toast.error(`${p.name}: last TCP test failed — fix IP/port or run Test ×5 again`);
        return;
      }
    }
    const payload = rowsToPayload(rows);
    setSavingCategoryId(categoryId);
    try {
      const res = await menuCategoryApi.setPrinters(categoryId, payload);
      setRowsByCategory((prev) => ({
        ...prev,
        [categoryId]: toRows(res.printers ?? payload),
      }));
      toast.success('Category printers saved');
      void kitchenPrintersApi.list().then(setPickerStations).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingCategoryId(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Loading category printers…</p>;
  }

  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Add menu categories first (Post Items → Categories).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-2">
          <Link2 size={16} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="text-sm font-semibold text-foreground">Category + name + IP + port only</p>
            <p>
              Save with <span className="font-mono">PUT /api/menu/categories/{'{categoryId}'}/printers</span>{' '}
              and body <span className="font-mono">{`{ "printers": [...] }`}</span>. No zone. Separate from Receipt Printer.
            </p>
            <p>
              Orders: <span className="font-mono">kitchenPrintJobs</span> + WebSocket{' '}
              <span className="font-mono">/topic/print/kitchen</span>.
            </p>
            <p>
              Use <strong className="text-foreground font-medium">Test ×5</strong> (TCP via{' '}
              <span className="font-mono">POST /api/config/printer/test</span>) before Save. Save is blocked if the
              last test for a row was all failures.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Tag size={14} className="text-purple-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Per category</span>
        </div>
        <div className="divide-y divide-border/50">
          {categories.map((cat) => {
            const rows = rowsByCategory[cat.id] ?? [];
            return (
              <div key={cat.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {cat.icon} {cat.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {pickerStations.length > 0 ? (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          applyPicker(cat.id, e.target.value);
                          e.target.value = '';
                        }}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 max-w-[11rem]"
                      >
                        <option value="">Copy existing station…</option>
                        {pickerStations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.printerIp})
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => addRow(cat.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border border-border hover:bg-muted/40"
                    >
                      <Plus size={12} />
                      Add row
                    </button>
                    <button
                      type="button"
                      disabled={savingCategoryId === cat.id}
                      onClick={() => void saveCategory(cat.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      <Save size={12} />
                      {savingCategoryId === cat.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No printers — add a row or copy an existing station.</p>
                ) : (
                  <div className="space-y-2">
                    {rows.map((row) => {
                      const pingKey = rowPingKey(cat.id, row.rowKey);
                      const pingSlots = rowPingSlots[pingKey] ?? idlePingSlots();
                      const pingRunning = Boolean(rowPingRunning[pingKey]);
                      const endpointOk = validatePrinterEndpoint(row.printerIp, row.printerPort).ok;
                      return (
                        <div key={row.rowKey} className="space-y-2 rounded-lg border border-border/60 p-3 bg-background/40">
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem_auto] gap-2 items-end">
                            <div>
                              <label className="block text-[10px] uppercase text-muted-foreground mb-1">Name</label>
                              <input
                                value={row.name}
                                onChange={(e) => updateRow(cat.id, row.rowKey, 'name', e.target.value)}
                                placeholder="Bar"
                                className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-muted-foreground mb-1">IP</label>
                              <input
                                value={row.printerIp}
                                onChange={(e) => updateRow(cat.id, row.rowKey, 'printerIp', e.target.value)}
                                placeholder="192.168.1.50"
                                className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] uppercase text-muted-foreground mb-1">Port</label>
                              <input
                                value={String(row.printerPort ?? 9100)}
                                onChange={(e) => updateRow(cat.id, row.rowKey, 'printerPort', e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm font-mono"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeRow(cat.id, row.rowKey)}
                              className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 mb-0.5"
                              title="Remove row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleTestRow(cat.id, row)}
                              disabled={pingRunning || !endpointOk}
                              title={
                                endpointOk
                                  ? 'TCP test ×5 (same as Receipt Printer)'
                                  : 'Enter a valid IPv4 and port first'
                              }
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pingRunning ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Ping…
                                </>
                              ) : (
                                <>
                                  <Wifi size={12} />
                                  Test ×5
                                </>
                              )}
                            </button>
                            <PrinterPingIndicators slots={pingSlots} />
                            {pingSummary(pingSlots) ? (
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {pingSummary(pingSlots)}
                              </span>
                            ) : null}
                            {rowPingDetail[pingKey] ? (
                              <span className="text-[10px] text-muted-foreground max-w-md truncate" title={rowPingDetail[pingKey]}>
                                {rowPingDetail[pingKey]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
