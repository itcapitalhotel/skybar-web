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

type PrinterRow = CategoryKitchenPrinter & {
  rowKey: string;
  /** Send `id` on PUT only when row came from this category's GET/PUT */
  idOwnedByCategory?: boolean;
};

function toRows(printers: CategoryKitchenPrinter[]): PrinterRow[] {
  return printers.map((p, i) => ({
    ...p,
    rowKey: p.id ?? `loaded-${i}-${p.printerIp}`,
    idOwnedByCategory: Boolean(p.id),
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
    .map(({ rowKey: _k, idOwnedByCategory, ...rest }) => {
      const out: CategoryKitchenPrinter = {
        name: rest.name.trim() || 'Printer',
        printerIp: rest.printerIp.trim(),
        printerPort: Number(rest.printerPort) || 9100,
      };
      if (rest.id && idOwnedByCategory) out.id = rest.id;
      return out;
    });
}

export function CategoryPrinterSettings({ reloadToken }: { reloadToken: number }) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [pickerStations, setPickerStations] = useState<KitchenPrinter[]>([]);
  const [pickerLoaded, setPickerLoaded] = useState(false);
  const [printersByCategory, setPrintersByCategory] = useState<Record<string, PrinterRow[]>>({});
  const [loadedCategoryIds, setLoadedCategoryIds] = useState<Set<string>>(() => new Set());
  const [loadingCategoryId, setLoadingCategoryId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [rowPingSlots, setRowPingSlots] = useState<Record<string, PingSlot[]>>({});
  const [rowPingRunning, setRowPingRunning] = useState<Record<string, boolean>>({});
  const [rowPingDetail, setRowPingDetail] = useState<Record<string, string>>({});

  const rowPingKey = (categoryId: string, rowKey: string) => `${categoryId}:${rowKey}`;

  const loadPickerCatalog = useCallback(async () => {
    if (pickerLoaded) return;
    try {
      const stations = await kitchenPrintersApi.list();
      setPickerStations(stations);
      setPickerLoaded(true);
    } catch {
      setPickerStations([]);
    }
  }, [pickerLoaded]);

  const applyMappingsToState = useCallback((mappings: { categoryId: string; printers: CategoryKitchenPrinter[] }[]) => {
    const map: Record<string, PrinterRow[]> = {};
    const loaded = new Set<string>();
    for (const m of mappings) {
      map[m.categoryId] = toRows(m.printers ?? []);
      loaded.add(m.categoryId);
    }
    setPrintersByCategory((prev) => ({ ...prev, ...map }));
    setLoadedCategoryIds((prev) => new Set([...prev, ...loaded]));
  }, []);

  const loadCategoryPrinters = useCallback(async (categoryId: string, force = false) => {
    if (!force && loadedCategoryIds.has(categoryId)) return;
    setLoadingCategoryId(categoryId);
    try {
      const res = await menuCategoryApi.loadCategoryPrintersView(categoryId);
      setPrintersByCategory((prev) => ({
        ...prev,
        [categoryId]: toRows(res.printers ?? []),
      }));
      setLoadedCategoryIds((prev) => new Set(prev).add(categoryId));
    } catch {
      toast.error('Could not load printers for this category');
    } finally {
      setLoadingCategoryId(null);
    }
  }, [loadedCategoryIds]);

  const loadInitial = useCallback(async () => {
    setInitialLoading(true);
    try {
      const cats = await menuCategoryApi.list();
      const active = cats.filter((c) => c.isActive !== false);
      setCategories(active);
      if (active.length > 0) {
        setSelectedCategoryId((prev) => (prev && active.some((c) => c.id === prev) ? prev : active[0].id));
      }

      try {
        const mappings = await menuCategoryApi.getPrinterMappings();
        applyMappingsToState(mappings);
      } catch {
        await Promise.all(
          active.map(async (cat) => {
            try {
              const res = await menuCategoryApi.loadCategoryPrintersView(cat.id);
              return { categoryId: cat.id, printers: res.printers ?? [] };
            } catch {
              return { categoryId: cat.id, printers: [] as CategoryKitchenPrinter[] };
            }
          }),
        ).then(applyMappingsToState);
      }
    } catch {
      toast.error('Could not load categories');
    } finally {
      setInitialLoading(false);
    }
  }, [applyMappingsToState]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, reloadToken]);

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
    setPrintersByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).map((r) =>
        r.rowKey === rowKey
          ? { ...r, [field]: field === 'printerPort' ? Number(value) || 9100 : value }
          : r,
      ),
    }));
  };

  const addRow = (categoryId: string) => {
    setPrintersByCategory((prev) => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] ?? []), newEmptyRow()],
    }));
  };

  const removeRow = (categoryId: string, rowKey: string) => {
    setPrintersByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((r) => r.rowKey !== rowKey),
    }));
  };

  const applyPicker = (categoryId: string, stationId: string) => {
    if (!stationId) return;
    const station = pickerStations.find((s) => s.id === stationId);
    if (!station) return;
    const alreadyLinkedHere = station.categoryIds?.includes(categoryId) ?? false;
    setPrintersByCategory((prev) => ({
      ...prev,
      [categoryId]: [
        ...(prev[categoryId] ?? []),
        {
          rowKey: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: station.name,
          printerIp: station.printerIp,
          printerPort: station.printerPort,
          ...(alreadyLinkedHere ? { id: station.id, idOwnedByCategory: true } : {}),
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
      await runTcpPrinterPingSeries(row.printerIp, row.printerPort, (index, slot) => {
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
    } finally {
      setRowPingRunning((prev) => ({ ...prev, [key]: false }));
    }
  };

  const saveCategory = async (categoryId: string) => {
    const rows = printersByCategory[categoryId] ?? [];
    const activeRows = rows.filter((r) => r.name.trim() || r.printerIp.trim());
    for (const row of activeRows) {
      const p = rowsToPayload([row])[0];
      if (!p) continue;
      const check = validatePrinterEndpoint(p.printerIp, p.printerPort);
      if (!check.ok) {
        toast.error(`${p.name}: ${check.error}`);
        return;
      }
      const pingKey = rowPingKey(categoryId, row.rowKey);
      const slots = rowPingSlots[pingKey];
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
      await menuCategoryApi.setPrinters(categoryId, payload);
      const fresh = await menuCategoryApi.loadCategoryPrintersView(categoryId);
      setPrintersByCategory((prev) => ({
        ...prev,
        [categoryId]: toRows(fresh.printers ?? []),
      }));
      setLoadedCategoryIds((prev) => new Set(prev).add(categoryId));
      toast.success('Saved for this category only');
      setPickerLoaded(false);
      void loadPickerCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingCategoryId(null);
    }
  };

  if (initialLoading) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Loading category printers…</p>;
  }

  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Add menu categories first (Post Items → Categories).
      </p>
    );
  }

  const activeCat = categories.find((c) => c.id === selectedCategoryId) ?? categories[0];
  const categoryId = activeCat.id;
  const rows = printersByCategory[categoryId] ?? [];
  const tabLoading = loadingCategoryId === categoryId;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-2">
          <Link2 size={16} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="text-sm font-semibold text-foreground">One printer list per category</p>
            <p>
              Tab load: <span className="font-mono">GET /api/menu/category-printers/{'{categoryId}'}</span> → bind{' '}
              <span className="font-mono">response.printers</span> only. Bootstrap:{' '}
              <span className="font-mono">GET …/category-printers/mappings</span>.
            </p>
            <p>
              Save: <span className="font-mono">PUT …/categories/{'{categoryId}'}/printers</span>, then re-GET that
              category. <span className="font-mono">GET /api/kitchen-printers</span> = picker only.
            </p>
            <p className="font-mono text-[10px] text-foreground/70">docs/FRONTEND_ADMIN_CATEGORY_PRINTERS.md</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/20 flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const count = (printersByCategory[cat.id] ?? []).length;
            const selected = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(cat.id);
                  void loadCategoryPrinters(cat.id, true);
                }}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  selected
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40',
                ].join(' ')}
              >
                {cat.icon} {cat.label}
                {count > 0 ? (
                  <span className="ml-1.5 tabular-nums opacity-70">({count})</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Tag size={14} className="text-purple-400" />
              {activeCat.icon} {activeCat.label}
              {tabLoading ? <span className="text-xs font-normal text-muted-foreground">Loading…</span> : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                defaultValue=""
                onFocus={() => void loadPickerCatalog()}
                onChange={(e) => {
                  applyPicker(categoryId, e.target.value);
                  e.target.value = '';
                }}
                className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 max-w-[13rem]"
              >
                <option value="">Copy existing station…</option>
                {pickerStations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.printerIp})
                    {s.categoryIds?.length ? ` · ${s.categoryIds.length} cat` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addRow(categoryId)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border border-border hover:bg-muted/40"
              >
                <Plus size={12} />
                Add row
              </button>
              <button
                type="button"
                disabled={savingCategoryId === categoryId || tabLoading}
                onClick={() => void saveCategory(categoryId)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Save size={12} />
                {savingCategoryId === categoryId ? 'Saving…' : 'Save category'}
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-4 text-center">
              No printers for {activeCat.label}. Other categories keep their own lists.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const pingKey = rowPingKey(categoryId, row.rowKey);
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
                          onChange={(e) => updateRow(categoryId, row.rowKey, 'name', e.target.value)}
                          placeholder="Bar"
                          className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-muted-foreground mb-1">IP</label>
                        <input
                          value={row.printerIp}
                          onChange={(e) => updateRow(categoryId, row.rowKey, 'printerIp', e.target.value)}
                          placeholder="192.168.1.50"
                          className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-muted-foreground mb-1">Port</label>
                        <input
                          value={String(row.printerPort ?? 9100)}
                          onChange={(e) => updateRow(categoryId, row.rowKey, 'printerPort', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(categoryId, row.rowKey)}
                        className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 mb-0.5"
                        title="Remove row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTestRow(categoryId, row)}
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
                        <span
                          className="text-[10px] text-muted-foreground max-w-md truncate"
                          title={rowPingDetail[pingKey]}
                        >
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
      </div>
    </div>
  );
}
