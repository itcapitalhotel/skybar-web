'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TopNav from '@/components/TopNav';
import { useAuthRole } from '@/hooks/useAuthUser';
import LockModal from '@/components/LockModal';
import ManagerPinModal from '@/components/ManagerPinModal';
import PaymentModal from '@/components/PaymentModal';
import SplitBillModal from '@/components/SplitBillModal';
import TransferTableModal from '@/components/TransferTableModal';
import NewTableDrawer from './NewTableDrawer';
import EditTablePanel from './EditTablePanel';
import FloorCanvas from './FloorCanvas';
import OrderPanel from './OrderPanel';
import MenuOverlay from './MenuOverlay';
import GuestInfoModal from './GuestInfoModal';
import { TableData, OrderItem, TableShape } from './floorData';
import { tablesApi, ordersApi, zonesApi, bookingsApi } from '@/lib/api/client';
import { getWsBaseUrl } from '@/lib/api/config';
import type { TableData as ApiTableData, ZoneData, Booking } from '@/lib/api/types';
import { applyBookingStatus, localDateString } from '@/lib/bookingTableStatus';
import { getStaffIdForOrder } from '@/lib/staffDisplay';
import type { ZoneMeta } from './floorData';
import { LayoutGrid, Plus, PenLine, Map, Users, Layers, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type ZoneFilter = 'all' | 'vip' | 'bar' | 'terrace' | 'cabana';

const DEFAULT_ZONE_TABS: { id: ZoneFilter; label: string }[] = [
  { id: 'all', label: 'All Zones' },
];

const STATUS_LEGEND = [
  { color: 'bg-emerald-500', label: 'Free', glow: 'shadow-emerald-500/40' },
  { color: 'bg-rose-500', label: 'Occupied', glow: '' },
  { color: 'bg-amber-500', label: 'Reserved', glow: '' },
  { color: 'bg-cyan-500', label: 'Bill Ready', glow: '' },
];

/** Map API TableData zone string to local zone key */
function normalizeZone(zone: string): TableData['zone'] {
  const z = zone.toLowerCase();
  if (z === 'vip' || z === 'bar' || z === 'terrace' || z === 'cabana') return z as TableData['zone'];
  return 'bar';
}

/** Convert API table to local TableData shape */
function apiTableToLocal(t: ApiTableData): TableData {
  return {
    id: t.id,
    label: t.label,
    zone: normalizeZone(t.zone),
    status: t.status as TableData['status'],
    guests: t.guestCount ?? t.guests ?? 0,
    capacity: t.capacity,
    staff: t.staff,
    seatedMinutes: t.seatedMinutes,
    minSpend: t.minSpend,
    orderTotal: t.orderTotal,
    shape: t.shape as TableData['shape'],
    x: t.x,
    y: t.y,
  };
}

export default function FloorMapClient() {
  const role = useAuthRole();
  const [lockOpen, setLockOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [zoneTabs, setZoneTabs] = useState(DEFAULT_ZONE_TABS);
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [tables, setTables] = useState<TableData[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tableOrders, setTableOrders] = useState<Record<string, OrderItem[]>>({});
  const [tableOrderTotals, setTableOrderTotals] = useState<Record<string, number>>({});
  /** API order id per table (from GET/POST orders — not client UUID) */
  const [tableOrderIds, setTableOrderIds] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [editTableSaving, setEditTableSaving] = useState(false);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [managerPinOpen, setManagerPinOpen] = useState(false);
  const [managerPinAction, setManagerPinAction] = useState('');
  const [managerPinCallback, setManagerPinCallback] = useState<(() => void) | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [menuTable, setMenuTable] = useState<TableData | null>(null);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [menuShowAll, setMenuShowAll] = useState(false);
  const [guestInfoTable, setGuestInfoTable] = useState<TableData | null>(null);
  const [pendingGuestCount, setPendingGuestCount] = useState<number>(0);
  const [tableNote, setTableNote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const wsReconnectRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await bookingsApi.list({ date: localDateString(), status: 'upcoming' });
      setBookings(data);
    } catch {
      setBookings([]);
    }
  }, []);

  const displayTables = useMemo(
    () => applyBookingStatus(tables, bookings),
    [tables, bookings],
  );

  // ── Fetch tables from API ──────────────────────────────────────────────────
  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const apiTables = await tablesApi.list();
      setTables(apiTables.map(apiTableToLocal));
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      const zones = await zonesApi.list();
      const tabs = [
        { id: 'all' as ZoneFilter, label: 'All Zones' },
        ...zones.filter(z => z.isActive).map(z => ({
          id: (['vip', 'bar', 'terrace', 'cabana'].includes(z.id.toLowerCase()) ? z.id.toLowerCase() : 'bar') as ZoneFilter,
          label: z.label,
        })),
      ];
      setZoneTabs(tabs);
    } catch {
      setZoneTabs(DEFAULT_ZONE_TABS);
    }
  }, []);

  const syncTableGuestCount = useCallback((tableId: string, guestCount: number) => {
    if (!Number.isFinite(guestCount) || guestCount < 1) return;
    setTables(prev =>
      prev.map(t => (t.id === tableId ? { ...t, guests: guestCount } : t)),
    );
    setSelectedTable(prev =>
      prev?.id === tableId ? { ...prev, guests: guestCount } : prev,
    );
  }, []);

  const fetchOrderForTable = useCallback(async (tableId: string) => {
    try {
      const order = await ordersApi.get(tableId);
      setTableOrders(prev => ({ ...prev, [tableId]: order.items }));
      setTableOrderTotals(prev => ({ ...prev, [tableId]: order.total }));
      if (order.orderId) {
        setTableOrderIds(prev => ({ ...prev, [tableId]: order.orderId! }));
      }
      const guestCount = order.guestCount;
      if (guestCount != null && guestCount > 0) {
        syncTableGuestCount(tableId, guestCount);
      }
    } catch {
      setTableOrders(prev => ({ ...prev, [tableId]: [] }));
      setTableOrderTotals(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      setTableOrderIds(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
    }
  }, [syncTableGuestCount]);

  // ── WebSocket: subscribe to /topic/tables/status ───────────────────────────
  const connectTableStatusWS = useCallback(() => {
    try {
      const wsBase = getWsBaseUrl();
      const ws = new WebSocket(`${wsBase}/ws/tables/status`);
      wsRef.current = ws;

      ws.onopen = () => {
        // STOMP CONNECT frame
        ws.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0');
        // Subscribe to topic
        ws.send('SUBSCRIBE\nid:sub-tables-status\ndestination:/topic/tables/status\n\n\0');
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = event.data as string;
          // Parse STOMP MESSAGE frame body
          const bodyStart = raw.indexOf('\n\n');
          if (bodyStart === -1) return;
          const body = raw.slice(bodyStart + 2).replace(/\0$/, '');
          const payload = JSON.parse(body) as {
            id: string;
            status: ApiTableData['status'];
            guests?: number;
            guestCount?: number;
            orderTotal?: number;
          };
          const party = payload.guestCount ?? payload.guests;
          setTables(prev => prev.map(t => {
            if (t.id !== payload.id) return t;
            return {
              ...t,
              status: payload.status as TableData['status'],
              guests: party ?? t.guests,
              orderTotal: payload.orderTotal ?? t.orderTotal,
            };
          }));
          // Keep selected table in sync
          setSelectedTable(prev => {
            if (!prev || prev.id !== payload.id) return prev;
            return {
              ...prev,
              status: payload.status as TableData['status'],
              guests: party ?? prev.guests,
            };
          });
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Auto-reconnect after 5 s
        wsReconnectRef.current = setTimeout(() => {
          connectTableStatusWS();
        }, 5000);
      };
    } catch {
      // WebSocket not available (SSR guard)
    }
  }, []);

  useEffect(() => {
    fetchTables();
    fetchBookings();
    fetchZones();
    connectTableStatusWS();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsReconnectRef.current) {
        clearTimeout(wsReconnectRef.current);
      }
    };
  }, [fetchTables, fetchBookings, fetchZones, connectTableStatusWS]);

  useEffect(() => {
    if (selectedTable) {
      fetchOrderForTable(selectedTable.id);
    }
  }, [selectedTable?.id, fetchOrderForTable]);

  // ── Update table status via API ────────────────────────────────────────────
  const updateTableStatus = useCallback(
    async (tableId: string, status: ApiTableData['status'], guestCount?: number) => {
      try {
        const staffId = getStaffIdForOrder();
        await tablesApi.updateStatus(tableId, {
          status,
          ...(guestCount != null ? { guestCount } : {}),
          ...(staffId ? { staff: staffId } : {}),
        });
      } catch {
        // optimistic update already applied
      }
    },
    [],
  );

  const currentItems = selectedTable ? (tableOrders[selectedTable.id] || []) : [];
  const currentTotal = (() => {
    if (!selectedTable) return 0;
    const fromApi = tableOrderTotals[selectedTable.id];
    if (fromApi != null && Number.isFinite(fromApi)) return fromApi;
    const sub = currentItems.reduce((a, i) => i.status !== 'Voided' ? a + i.unitPrice * i.qty : a, 0);
    return sub * 1.21;
  })();

  const handleVoidItem = async (itemId: string) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    await ordersApi.voidItem(tableId, itemId, { reason: 'Removed from table order' });
    await fetchOrderForTable(tableId);
  };

  const handleClearTable = async () => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    try {
      await ordersApi.clear(tableId);
      await updateTableStatus(tableId, 'available', 0);
      setTableOrderIds(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
    } catch {
      toast.error('Failed to clear table order');
      return;
    }
    setTableOrders(prev => ({ ...prev, [tableId]: [] }));
    setTables(prev => prev.map(t =>
      t.id === tableId
        ? { ...t, status: 'available', guests: 0, seatedMinutes: 0, orderTotal: 0 }
        : t,
    ));
    setSelectedTable(null);
    toast.success('Table cleared');
  };

  const handleRequestManagerPin = (action: string, callback: () => void) => {
    setManagerPinAction(action);
    setManagerPinCallback(() => callback);
    setManagerPinOpen(true);
  };

  const handleManagerApprove = () => {
    setManagerPinOpen(false);
    if (managerPinCallback) managerPinCallback();
  };

  const handleLock = () => {
    setLockOpen(true);
    setLocked(true);
  };

  const handleUnlock = () => {
    setLocked(false);
    setLockOpen(false);
  };

  const resolveGuestCountForTable = (tableId: string): number => {
    if (pendingGuestCount > 0) return pendingGuestCount;
    const t = tables.find(tbl => tbl.id === tableId) ?? (selectedTable?.id === tableId ? selectedTable : null);
    return Math.max(1, t?.guests ?? 1);
  };

  const handleAddItemsToTable = async (tableId: string, newItems: OrderItem[]) => {
    const staffId = getStaffIdForOrder();
    if (!staffId) return;
    const guestCount = resolveGuestCountForTable(tableId);
    try {
      const result = await ordersApi.addItems(tableId, {
        staff: staffId,
        guestCount,
        items: newItems.map(i => ({
          menuItemId: i.menuItemId ?? i.id,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          size: i.size,
          notes: i.notes,
        })),
      });
      if (result.orderId) {
        setTableOrderIds(prev => ({ ...prev, [tableId]: String(result.orderId) }));
      }
      if (result.guestCount != null && result.guestCount > 0) {
        syncTableGuestCount(tableId, result.guestCount);
      }
      const jobs = result.kitchenPrintJobs ?? result.categoryPrintJobs;
      const printJobs = jobs?.length ?? 0;
      if (printJobs > 0) {
        toast.success(`Order sent · ${printJobs} kitchen print job${printJobs !== 1 ? 's' : ''} (see /topic/print/kitchen)`);
      } else {
        toast.success('Order sent to kitchen');
      }
      await fetchOrderForTable(tableId);
    } catch {
      setTableOrders(prev => ({
        ...prev,
        [tableId]: [...(prev[tableId] ?? []), ...newItems],
      }));
    }
    setTables(prev => prev.map(t => {
      if (t.id === tableId && t.status === 'available') {
        void updateTableStatus(tableId, 'occupied', guestCount);
        return { ...t, status: 'occupied', guests: guestCount };
      }
      return t;
    }));
    const t = tables.find(tbl => tbl.id === tableId);
    if (t) setSelectedTable({ ...t, status: 'occupied', guests: pendingGuestCount || t.guests || 1 });
    setMenuTable(null);
    setMenuShowAll(false);
    setPendingGuestCount(0);
  };

  const handleOpenMenu = (table: TableData) => {
    setMenuShowAll(false);
    // For free tables, show guest info step first
    if (table.status === 'available') {
      setGuestInfoTable(table);
    } else {
      setTableNote('');
      setMenuTable(table);
    }
  };

  const handleGuestInfoConfirm = (guestCount: number, note: string) => {
    if (!guestInfoTable) return;
    setPendingGuestCount(guestCount);
    setTableNote(note);
    setTables(prev => prev.map(t => t.id === guestInfoTable.id ? { ...t, guests: guestCount } : t));
    setMenuTable({ ...guestInfoTable, guests: guestCount });
    setGuestInfoTable(null);
    void updateTableStatus(guestInfoTable.id, 'occupied', guestCount);
  };

  // Open menu for an already-occupied table to add more items
  const handleAddMoreItems = () => {
    if (!selectedTable) return;
    setMenuShowAll(true);
    setMenuTable(selectedTable);
  };

  const handleUpdatePositions = useCallback(async (positions: Record<string, { x: number; y: number }>) => {
    const updates = Object.entries(positions).map(([id, { x, y }]) => {
      const table = tables.find((t) => t.id === id);
      return { id, x, y, shape: table?.shape };
    });

    try {
      await tablesApi.updateLayout(updates);
    } catch {
      toast.error('Failed to save floor layout');
      throw new Error('Failed to save floor layout');
    }

    setTables((prev) =>
      prev.map((t) => {
        const pos = positions[t.id];
        return pos ? { ...t, x: pos.x, y: pos.y } : t;
      }),
    );
    setSavedPositions(positions);
    toast.success('Floor layout saved');
  }, [tables]);

  const handleRenameTable = useCallback(async (tableId: string, label: string) => {
    setEditTableSaving(true);
    try {
      await tablesApi.update(tableId, { label });
      setTables(prev => prev.map(t => (t.id === tableId ? { ...t, label } : t)));
      setSelectedTable(prev => (prev?.id === tableId ? { ...prev, label } : prev));
      toast.success('Table name updated');
    } catch {
      toast.error('Failed to update table name');
    } finally {
      setEditTableSaving(false);
    }
  }, []);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    setEditTableSaving(true);
    try {
      await tablesApi.delete(tableId);
      setTables(prev => prev.filter(t => t.id !== tableId));
      setSavedPositions(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      setTableOrders(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      setTableOrderTotals(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      setTableOrderIds(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      setSelectedTable(prev => (prev?.id === tableId ? null : prev));
      toast.success('Table deleted');
    } catch {
      toast.error('Could not delete table — it may still be in use');
    } finally {
      setEditTableSaving(false);
    }
  }, []);

  const handleChangeShape = useCallback(async (tableId: string, shape: TableShape) => {
    const previous = tables.find((t) => t.id === tableId);
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, shape } : t)));

    try {
      await tablesApi.update(tableId, { shape });
      toast.success('Table shape saved');
    } catch {
      if (previous) {
        setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, shape: previous.shape } : t)));
      }
      toast.error('Failed to save table shape');
      throw new Error('Failed to save table shape');
    }
  }, [tables]);

  const handleSelectTable = (table: TableData | null) => {
    setSelectedTable(table);
  };

  const handleSplitComplete = async () => {
    if (!selectedTable) return;
    await Promise.all([
      fetchOrderForTable(selectedTable.id),
      fetchTables(),
    ]);
  };

  const handleTableTransferred = async (targetTableId: string) => {
    const sourceId = selectedTable?.id;
    try {
      const apiTables = await tablesApi.list();
      const local = apiTables.map(apiTableToLocal);
      setTables(local);
      const target = local.find(t => t.id === targetTableId);
      if (target) setSelectedTable(target);
      await Promise.all([
        fetchOrderForTable(targetTableId),
        sourceId && sourceId !== targetTableId ? fetchOrderForTable(sourceId) : Promise.resolve(),
      ]);
      if (sourceId && sourceId !== targetTableId) {
        setTableOrders(prev => ({ ...prev, [sourceId]: [] }));
      }
    } catch {
      toast.error('Check moved but floor map could not refresh — tap Refresh');
    }
  };

  const totalOccupied = displayTables.filter(t => t.status === 'occupied').length;
  const totalAvailable = displayTables.filter(t => t.status === 'available').length;
  const totalCovers = displayTables.filter(t => t.status === 'occupied').reduce((a, t) => a + t.guests, 0);

  const handlePaymentComplete = async () => {
    setPaymentOpen(false);
    if (!selectedTable) return;
    try {
      await ordersApi.clear(selectedTable.id);
    } catch { /* optimistic */ }
    setTables(prev => prev.map(t => {
      if (t.id === selectedTable.id) {
        void updateTableStatus(selectedTable.id, 'available', 0);
        return { ...t, status: 'available', guests: 0, seatedMinutes: 0, orderTotal: 0 };
      }
      return t;
    }));
    setTableOrders(prev => ({ ...prev, [selectedTable.id]: [] }));
    setTableOrderIds(prev => {
      const next = { ...prev };
      delete next[selectedTable.id];
      return next;
    });
    setSelectedTable(null);
  };

  const handleTableAdded = () => {
    fetchTables();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav onLockTerminal={handleLock} />

      {/* Lock Overlay */}
      {locked && !lockOpen && (
        <div
          className="fixed inset-0 z-50 modal-overlay flex items-center justify-center cursor-pointer"
          onClick={() => setLockOpen(true)}
        >
          <div className="glass-card-elevated rounded-2xl border border-border p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid size={28} className="text-rose-400" />
            </div>
            <p className="text-lg font-semibold text-foreground mb-1">Terminal Locked</p>
            <p className="text-sm text-muted-foreground">Tap to unlock</p>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 max-w-screen-2xl mx-auto w-full px-3 md:px-4 lg:px-6 xl:px-8 py-3 md:py-4 gap-3 md:gap-4">
        {/* Quick Stats Bar */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/30 border border-border">
            <Map size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Floor Plan</span>
          </div>

          <div className="flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2 md:py-2.5 rounded-xl glass-card border border-border flex-wrap gap-y-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-muted-foreground">Occupied:</span>
              <span className="text-foreground font-semibold text-tabular">{totalOccupied}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60" />
              <span className="text-muted-foreground">Free:</span>
              <span className="text-foreground font-semibold text-tabular">{totalAvailable}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Covers:</span>
              <span className="text-primary font-bold text-tabular">{totalCovers}</span>
            </div>
          </div>

          {/* Legend — hidden on small, visible md+ */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2.5 rounded-xl glass-card border border-border flex-wrap gap-y-1">
            {STATUS_LEGEND.map(l => (
              <div key={`legend-${l.label}`} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                <span className="text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Admin controls */}
          {(role === 'Admin' || role === 'Manager') && (
            <div className="ml-auto flex gap-1.5 md:gap-2 flex-wrap">
              <button
                onClick={() => { fetchTables(); fetchBookings(); }}
                disabled={loading}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground transition-all text-xs font-medium disabled:opacity-50"
                title="Refresh tables"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              {role === 'Admin' && (
                <>
                  <Link
                    href="/user-management"
                    className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-medium hover:bg-violet-500/20 transition-all"
                  >
                    <Users size={13} /> <span className="hidden sm:inline">Users</span>
                  </Link>
                  <Link
                    href="/zone-management"
                    className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-all"
                  >
                    <Layers size={13} /> <span className="hidden sm:inline">Zones</span>
                  </Link>
                  <button
                    onClick={() => {
                      setEditMode(v => {
                        if (v) setSelectedTable(null);
                        return !v;
                      });
                    }}
                    className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-150 ${
                      editMode
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' :'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <PenLine size={13} />
                    <span className="hidden sm:inline">{editMode ? 'Editing' : 'Edit Floor'}</span>
                  </button>
                  {editMode && (
                    <button
                      onClick={() => setNewTableOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl bg-primary/15 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/20 transition-all"
                    >
                      <Plus size={13} /> <span className="hidden sm:inline">Add Table</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Zone Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
          {zoneTabs.map(tab => (
            <button
              key={`zone-${tab.id}`}
              onClick={() => setZoneFilter(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                zoneFilter === tab.id
                  ? 'bg-primary/15 text-primary border border-primary/30' :'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Hint bar */}
        {editMode ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <PenLine size={12} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400/90">
              Tap a table to <strong className="text-amber-300">rename or delete</strong> in the panel · Drag to move · Save layout when done
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-emerald-400/80">
              Tap a <strong className="text-emerald-400">green (free)</strong> table to open the menu · Tap an <strong className="text-rose-400">occupied</strong> table to view its order
            </span>
          </div>
        )}

        {/* Main Content: Canvas + Order Panel — side by side on lg+, stacked on tablet */}
        <div className="flex flex-col lg:flex-row gap-3 md:gap-4 flex-1 min-h-0" style={{ minHeight: '500px' }}>
          {/* Floor Canvas */}
          <div className="flex-1 glass-card rounded-2xl border border-border overflow-hidden flex flex-col" style={{ minHeight: '420px' }}>
            <FloorCanvas
              tables={displayTables}
              selectedTableId={selectedTable?.id ?? null}
              onSelectTable={handleSelectTable}
              onOpenMenu={handleOpenMenu}
              zoneFilter={zoneFilter}
              editMode={editMode}
              onUpdatePositions={handleUpdatePositions}
              savedPositions={savedPositions}
              onChangeShape={handleChangeShape}
            />
          </div>

          {/* Order Panel — full width on tablet, fixed sidebar on lg+ */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 glass-card rounded-2xl border border-border overflow-hidden flex flex-col" style={{ minHeight: '320px', maxHeight: '600px' }}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {editMode ? 'Edit Table' : 'Order Panel'}
              </span>
              {!editMode && (
                <div className="flex items-center gap-2">
                  {selectedTable && (
                    <span className="text-xs text-muted-foreground">{currentItems.length} items</span>
                  )}
                  {selectedTable && (selectedTable.status === 'occupied' || selectedTable.status === 'bill') && (
                    <button
                      onClick={handleAddMoreItems}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all text-[10px] font-semibold"
                      title="Add more items to this order"
                    >
                      <Plus size={10} />
                      Add Items
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {editMode ? (
                <EditTablePanel
                  table={selectedTable}
                  saving={editTableSaving}
                  onRename={handleRenameTable}
                  onDelete={handleDeleteTable}
                />
              ) : (
                <OrderPanel
                  table={selectedTable}
                  items={currentItems}
                  role={role}
                  onVoidItem={handleVoidItem}
                  onOpenSplit={() => setSplitOpen(true)}
                  onOpenTransfer={() => setTransferOpen(true)}
                  onOpenPayment={() => setPaymentOpen(true)}
                  onRequestManagerPin={handleRequestManagerPin}
                  onClearTable={handleClearTable}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Menu Overlay */}
      {menuTable && (
        <MenuOverlay
          table={menuTable}
          onClose={() => { setMenuTable(null); setMenuShowAll(false); setTableNote(''); }}
          onAddItems={handleAddItemsToTable}
          showAll={menuShowAll}
          tableNote={tableNote}
        />
      )}

      {/* Guest Info Modal */}
      {guestInfoTable && (
        <GuestInfoModal
          table={guestInfoTable}
          onClose={() => setGuestInfoTable(null)}
          onConfirm={handleGuestInfoConfirm}
        />
      )}

      {/* Modals */}
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={handleUnlock} />
      <ManagerPinModal
        isOpen={managerPinOpen}
        onClose={() => setManagerPinOpen(false)}
        onApprove={handleManagerApprove}
        actionLabel={managerPinAction}
        action={
          managerPinAction.toLowerCase().includes('void')
            ? 'VOID_ITEM'
            : managerPinAction.toLowerCase().includes('clear')
              ? 'CLEAR_TABLE'
              : managerPinAction.toLowerCase().includes('change table')
                ? 'TRANSFER_TABLE'
                : 'PRIVILEGED_ACTION'
        }
      />
      {selectedTable && (
        <>
          <PaymentModal
            isOpen={paymentOpen}
            onClose={() => setPaymentOpen(false)}
            onPaymentComplete={handlePaymentComplete}
            total={currentTotal}
            tableId={selectedTable.id}
            guestCount={Math.max(1, selectedTable.guests ?? 1)}
          />
          <SplitBillModal
            isOpen={splitOpen}
            onClose={() => setSplitOpen(false)}
            items={currentItems.filter(i => i.status !== 'Voided').map(i => ({
              id: i.id, name: i.name, qty: i.qty, price: i.unitPrice
            }))}
            total={currentTotal}
            tableId={selectedTable.id}
            tableLabel={selectedTable.label}
            guestCount={Math.max(1, selectedTable.guests ?? 1)}
            onSplitComplete={() => void handleSplitComplete()}
          />
          <TransferTableModal
            isOpen={transferOpen}
            onClose={() => setTransferOpen(false)}
            sourceTable={selectedTable}
            tables={tables}
            onTransferred={targetId => void handleTableTransferred(targetId)}
          />
        </>
      )}
      <NewTableDrawer isOpen={newTableOpen} onClose={() => setNewTableOpen(false)} onTableAdded={handleTableAdded} />
    </div>
  );
}