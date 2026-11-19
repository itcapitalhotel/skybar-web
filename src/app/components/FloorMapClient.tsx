'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import TopNav from '@/components/TopNav';
import { useAuthRole } from '@/hooks/useAuthUser';
import EditTablePanel from './EditTablePanel';
import FloorCanvas from './FloorCanvas';
import OrderPanel from './OrderPanel';

const LockModal = dynamic(() => import('@/components/LockModal'));
const ManagerPinModal = dynamic(() => import('@/components/ManagerPinModal'));
const PaymentModal = dynamic(() => import('@/components/PaymentModal'));
const SplitBillModal = dynamic(() => import('@/components/SplitBillModal'));
const TransferTableModal = dynamic(() => import('@/components/TransferTableModal'));
const NewTableDrawer = dynamic(() => import('./NewTableDrawer'));
const MenuOverlay = dynamic(() => import('./MenuOverlay'));
const GuestInfoModal = dynamic(() => import('./GuestInfoModal'));
import { TableData, OrderItem, TableShape, ZoneMeta } from './floorData';
import { tablesApi, ordersApi, zonesApi, bookingsApi, menuApi } from '@/lib/api/client';
import { getWsBaseUrl } from '@/lib/api/config';
import type { TableData as ApiTableData, ZoneData, Booking } from '@/lib/api/types';
import { applyBookingStatus, localDateString } from '@/lib/bookingTableStatus';
import { getStaffIdForOrder } from '@/lib/staffDisplay';
import { findZone } from '@/lib/zoneResolve';
import { LayoutGrid, Plus, PenLine, Map as MapIcon, Users, Layers, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type ZoneFilter = string; // 'all' | zone id from GET /zones

const DEFAULT_ZONE_TABS: { id: ZoneFilter; label: string }[] = [
  { id: 'all', label: 'All Zones' },
];

const STATUS_LEGEND = [
  { color: 'bg-emerald-500', label: 'Free', glow: 'shadow-emerald-500/40' },
  { color: 'bg-rose-500', label: 'Occupied', glow: '' },
  { color: 'bg-amber-500', label: 'Reserved', glow: '' },
  { color: 'bg-cyan-500', label: 'Bill Ready', glow: '' },
];

function toZoneMeta(z: ZoneData): ZoneMeta {
  const color = z.color?.trim() || '#06b6d4';
  return {
    id: z.id,
    label: z.label,
    color,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}18` : 'rgba(15,23,42,0.6)',
    description: z.description ?? '',
    canvasWidth: z.canvasWidth || 1200,
    canvasHeight: z.canvasHeight || 700,
  };
}

function sameTableRecord(a: TableData, b: TableData): boolean {
  return a.id === b.id
    && a.label === b.label
    && a.zone === b.zone
    && a.status === b.status
    && a.guests === b.guests
    && a.capacity === b.capacity
    && a.staff === b.staff
    && a.seatedMinutes === b.seatedMinutes
    && a.minSpend === b.minSpend
    && a.orderTotal === b.orderTotal
    && a.shape === b.shape
    && a.x === b.x
    && a.y === b.y;
}

/** Keep the previous object when a table did not change, so React can skip that node. */
function shareTableList(prev: TableData[], next: TableData[]): TableData[] {
  if (prev.length === next.length && prev.every((row, index) => sameTableRecord(row, next[index]))) {
    return prev;
  }
  const prevById = new Map(prev.map((row) => [row.id, row]));
  const merged = next.map((row) => {
    const old = prevById.get(row.id);
    return old && sameTableRecord(old, row) ? old : row;
  });
  if (merged.length === prev.length && merged.every((row, index) => row === prev[index])) return prev;
  return merged;
}

/** Convert API table to local TableData — resolve zone to canonical GET /zones id when possible */
function apiTableToLocal(t: ApiTableData, zones: ZoneData[] = []): TableData {
  const rawZone = String(t.zone ?? '').trim();
  const matched = findZone(zones, rawZone);
  return {
    id: t.id,
    label: t.label,
    zone: matched?.id ?? rawZone,
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
  const [visibleZoneId, setVisibleZoneId] = useState<string | null>(null);
  const [zoneTabs, setZoneTabs] = useState(DEFAULT_ZONE_TABS);
  const [zoneCatalog, setZoneCatalog] = useState<ZoneData[]>([]);
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
  const [guestInfoName, setGuestInfoName] = useState('');
  const [guestInfoNote, setGuestInfoNote] = useState('');
  const openedFromBookingRef = React.useRef(false);
  const [pendingGuestCount, setPendingGuestCount] = useState<number>(0);
  const [tableNote, setTableNote] = useState<string>('');
  const [tableOrderNotes, setTableOrderNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const wsReconnectRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsAllowReconnectRef = React.useRef(true);
  const zoneCatalogRef = React.useRef<ZoneData[]>(zoneCatalog);
  zoneCatalogRef.current = zoneCatalog;

  const bookingsSigRef = React.useRef('');
  const tablesReqRef = React.useRef(0);
  const pollBusyRef = React.useRef(false);
  const reservedViewRef = React.useRef(new Map<string, TableData>());
  const wsPatchesRef = React.useRef(new Map<string, { status: TableData['status']; guests?: number; orderTotal?: number }>());
  const wsFrameRef = React.useRef(0);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await bookingsApi.list({ date: localDateString(), status: 'upcoming' });
      const sig = data.map((b) => `${b.id}:${b.status}:${b.tableId}:${b.time}`).join('|');
      if (sig === bookingsSigRef.current) return;
      bookingsSigRef.current = sig;
      setBookings(data);
    } catch {
      /* keep the last list so a blip does not clear reserved tables */
    }
  }, []);

  const displayTables = useMemo(
    () => applyBookingStatus(tables, bookings, localDateString(), reservedViewRef.current),
    [tables, bookings],
  );

  const activeZoneMetas = useMemo(
    () => zoneCatalog.filter((z) => z.isActive).map(toZoneMeta),
    [zoneCatalog],
  );

  // ── Fetch tables from API ──────────────────────────────────────────────────
  /** `silent` skips the loading spinner (used by the background poll). */
  const fetchTables = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const reqId = ++tablesReqRef.current;
    if (!silent) setLoading(true);
    try {
      const apiTables = await tablesApi.list();
      if (reqId !== tablesReqRef.current) return;
      const local = apiTables.map((t) => apiTableToLocal(t, zoneCatalogRef.current));
      const apply = (prev: TableData[]) => shareTableList(prev, local);
      if (silent) React.startTransition(() => setTables(apply));
      else setTables(apply);
    } catch {
      if (!silent && reqId === tablesReqRef.current) setTables([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      const zones = await zonesApi.list();
      setZoneCatalog(zones);
      const tabs = [
        { id: 'all', label: 'All Zones' },
        ...zones.filter((z) => z.isActive).map((z) => ({
          id: z.id,
          label: z.label,
        })),
      ];
      setZoneTabs(tabs);
    } catch {
      setZoneCatalog([]);
      setZoneTabs(DEFAULT_ZONE_TABS);
    }
  }, []);

  // Seat from Table Bookings lands here and opens the same guest → menu flow as a floor tap.
  useEffect(() => {
    if (openedFromBookingRef.current || tables.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('openTable');
    if (!openId) return;
    const table = tables.find((t) => t.id === openId);
    if (!table) return;
    openedFromBookingRef.current = true;
    const guests = Number(params.get('guests'));
    const note = params.get('note') ?? '';
    const seated: TableData = {
      ...table,
      guests: Number.isFinite(guests) && guests > 0 ? guests : table.guests,
      status: 'occupied',
    };
    setZoneFilter(seated.zone || 'all');
    setSelectedTable(seated);
    setTables((prev) => prev.map((t) => (t.id === seated.id ? { ...t, ...seated } : t)));
    setTableNote(note);
    setGuestInfoNote(note);
    setGuestInfoName(params.get('guest') ?? '');
    setMenuShowAll(false);
    setGuestInfoTable(seated);
    window.history.replaceState(null, '', window.location.pathname);
  }, [tables]);

  // Re-bind table.zone to canonical zone ids once the zone catalog is available
  useEffect(() => {
    if (zoneCatalog.length === 0) return;
    setTables((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        const matched = findZone(zoneCatalog, t.zone);
        if (!matched || matched.id === t.zone) return t;
        changed = true;
        return { ...t, zone: matched.id };
      });
      return changed ? next : prev;
    });
  }, [zoneCatalog]);

  const syncTableGuestCount = useCallback((tableId: string, guestCount: number) => {
    if (!Number.isFinite(guestCount) || guestCount < 1) return;
    setTables(prev => {
      let changed = false;
      const next = prev.map(t => {
        if (t.id !== tableId || t.guests === guestCount) return t;
        changed = true;
        return { ...t, guests: guestCount };
      });
      return changed ? next : prev;
    });
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
      setTableOrderNotes(prev => ({ ...prev, [tableId]: order.note?.trim() ?? '' }));
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
      setTableOrderNotes(prev => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
    }
  }, [syncTableGuestCount]);

  // ── WebSocket: subscribe to /topic/tables/status ───────────────────────────
  const connectTableStatusWS = useCallback(() => {
    try {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
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
          wsPatchesRef.current.set(payload.id, {
            status: payload.status as TableData['status'],
            guests: party,
            orderTotal: payload.orderTotal,
          });
          if (wsFrameRef.current) return;
          wsFrameRef.current = requestAnimationFrame(() => {
            wsFrameRef.current = 0;
            const batch = wsPatchesRef.current;
            if (batch.size === 0) return;
            wsPatchesRef.current = new Map();
            setTables((prev) => {
              let changed = false;
              const next = prev.map((t) => {
                const patch = batch.get(t.id);
                if (!patch) return t;
                const guests = patch.guests ?? t.guests;
                const orderTotal = patch.orderTotal ?? t.orderTotal;
                if (t.status === patch.status && t.guests === guests && t.orderTotal === orderTotal) return t;
                changed = true;
                return { ...t, status: patch.status, guests, orderTotal };
              });
              return changed ? next : prev;
            });
            setSelectedTable((prev) => {
              if (!prev) return prev;
              const patch = batch.get(prev.id);
              if (!patch) return prev;
              const guests = patch.guests ?? prev.guests;
              if (prev.status === patch.status && prev.guests === guests) return prev;
              return { ...prev, status: patch.status, guests };
            });
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
        if (!wsAllowReconnectRef.current) return;
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
    wsAllowReconnectRef.current = true;
    void fetchTables();
    void fetchBookings();
    void fetchZones();
    connectTableStatusWS();

    // WebSocket pushes table status. This poll is only a backup, and it
    // skips the redraw when nothing changed. Hidden tabs do not poll.
    const poll = () => {
      if (document.hidden || pollBusyRef.current) return;
      pollBusyRef.current = true;
      void Promise.all([fetchTables({ silent: true }), fetchBookings()]).finally(() => {
        pollBusyRef.current = false;
      });
    };
    const pollId = setInterval(poll, 15000);
    document.addEventListener('visibilitychange', poll);
    const prefetchMenu = () => {
      void menuApi.categories();
      void menuApi.items();
    };
    let cancelPrefetch = () => {};
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(prefetchMenu);
      cancelPrefetch = () => cancelIdleCallback(idleId);
    } else {
      const timeoutId = window.setTimeout(prefetchMenu, 400);
      cancelPrefetch = () => clearTimeout(timeoutId);
    }

    return () => {
      clearInterval(pollId);
      document.removeEventListener('visibilitychange', poll);
      cancelPrefetch();
      if (wsFrameRef.current) cancelAnimationFrame(wsFrameRef.current);
      wsAllowReconnectRef.current = false;
      if (wsReconnectRef.current) {
        clearTimeout(wsReconnectRef.current);
        wsReconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
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

  const handleVoidItem = async (itemId: string, reason: string) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    const staff = getStaffIdForOrder();
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error('Enter a reason to remove this item');
    }
    if (!staff) {
      throw new Error('Sign in again to remove an item');
    }
    if (!itemId || itemId.startsWith('item-')) {
      throw new Error('This item is not saved on the order yet');
    }
    try {
      await ordersApi.voidItem(tableId, itemId, { reason: trimmed, staff });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!/already voided/i.test(message)) throw err;
    }
    await fetchOrderForTable(tableId);
  };

  const handleUpdateItemQty = async (itemId: string, qty: number) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    if (!itemId || itemId.startsWith('item-')) {
      throw new Error('This item is not saved on the order yet');
    }
    await ordersApi.updateItem(tableId, itemId, { qty });
    await fetchOrderForTable(tableId);
  };

  const handleUpdateItemNote = async (itemId: string, qty: number, notes: string) => {
    if (!selectedTable) return;
    const tableId = selectedTable.id;
    if (!itemId || itemId.startsWith('item-')) {
      throw new Error('This item is not saved on the order yet');
    }
    await ordersApi.updateItem(tableId, itemId, { qty, notes });
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

  const handleAddItemsToTable = async (tableId: string, newItems: OrderItem[], orderNote?: string) => {
    const staffId = getStaffIdForOrder();
    if (!staffId) {
      throw new Error('Sign in again to send the order');
    }
    const guestCount = resolveGuestCountForTable(tableId);
    const sharedNote = orderNote?.trim() ?? '';
    try {
      const result = await ordersApi.addItems(tableId, {
        staff: staffId,
        guestCount,
        ...(sharedNote ? { note: sharedNote } : {}),
        items: newItems.map(i => {
          const lineNote = i.notes?.trim() ?? '';
          return {
            menuItemId: i.menuItemId ?? i.id,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
            categoryId: i.categoryId,
            size: i.size,
            ...(lineNote ? { note: lineNote } : {}),
          };
        }),
      });
      if (result.orderId) {
        setTableOrderIds(prev => ({ ...prev, [tableId]: String(result.orderId) }));
      }
      if (result.addedItems?.length) {
        const saved = result.addedItems.map((row) => ({
          ...row,
          id: String(row.id),
          qty: Number(row.qty ?? 1),
          unitPrice: Number(row.unitPrice ?? 0),
          status: row.status ?? 'Queued',
        }));
        setTableOrders(prev => ({
          ...prev,
          [tableId]: [...(prev[tableId] ?? []).filter(i => i.id && !i.id.startsWith('item-')), ...saved],
        }));
      }
      if (result.guestCount != null && result.guestCount > 0) {
        syncTableGuestCount(tableId, result.guestCount);
      }
      const jobs = result.kitchenPrintJobs ?? result.categoryPrintJobs;
      const printJobs = jobs?.length ?? 0;
      if (printJobs > 0) {
        toast.success(`Order sent · ${printJobs} kitchen ticket${printJobs !== 1 ? 's' : ''} queued`);
      } else {
        toast.success('Order sent to kitchen');
      }
      await fetchOrderForTable(tableId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the order');
      throw err;
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
    setGuestInfoName('');
    setGuestInfoNote('');
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
      setSelectedTable((prev) => (prev?.id === tableId ? { ...prev, shape } : prev));
      toast.success('Table shape saved');
    } catch {
      if (previous) {
        setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, shape: previous.shape } : t)));
        setSelectedTable((prev) =>
          prev?.id === tableId ? { ...prev, shape: previous.shape } : prev,
        );
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
      const local = apiTables.map((t) => apiTableToLocal(t, zoneCatalog));
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
            <MapIcon size={12} className="text-muted-foreground" />
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
              zones={activeZoneMetas}
              editMode={editMode}
              onUpdatePositions={handleUpdatePositions}
              savedPositions={savedPositions}
              onChangeShape={handleChangeShape}
              onActiveZoneChange={setVisibleZoneId}
            />
          </div>

          {/* Order Panel — capped on tablet so Pay Now stays visible; stretches beside map on lg+ */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 glass-card rounded-2xl border border-border overflow-hidden flex flex-col min-h-0 h-[min(560px,58dvh)] max-h-[min(560px,58dvh)] lg:h-auto lg:max-h-none lg:self-stretch">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
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
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {editMode ? (
                <EditTablePanel
                  table={selectedTable}
                  saving={editTableSaving}
                  zoneLabel={selectedTable ? (findZone(zoneCatalog, selectedTable.zone)?.label || selectedTable.zone) : undefined}
                  onRename={handleRenameTable}
                  onDelete={handleDeleteTable}
                  onChangeShape={handleChangeShape}
                />
              ) : (
                <OrderPanel
                  table={selectedTable}
                  items={currentItems}
                  role={role}
                  onVoidItem={handleVoidItem}
                  onUpdateQty={handleUpdateItemQty}
                  onUpdateNote={handleUpdateItemNote}
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
          tableNote={tableOrderNotes[menuTable.id] || tableNote}
        />
      )}

      {/* Guest Info Modal */}
      {guestInfoTable && (
        <GuestInfoModal
          table={guestInfoTable}
          zones={zoneCatalog}
          initialGuests={guestInfoTable.guests}
          initialNote={guestInfoNote}
          guestName={guestInfoName}
          onClose={() => { setGuestInfoTable(null); setGuestInfoName(''); setGuestInfoNote(''); }}
          onConfirm={handleGuestInfoConfirm}
        />
      )}

      {/* Modals — mounted only while open so their code stays off the floor */}
      {lockOpen && (
        <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={handleUnlock} />
      )}
      {managerPinOpen && (
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
      )}
      {selectedTable && (
        <>
          {paymentOpen && (
          <PaymentModal
            isOpen={paymentOpen}
            onClose={() => setPaymentOpen(false)}
            onPaymentComplete={handlePaymentComplete}
            total={currentTotal}
            tableId={selectedTable.id}
            guestCount={Math.max(1, selectedTable.guests ?? 1)}
            orderLineItems={currentItems
              .filter((i) => i.status !== 'Voided')
              .map((i) => ({
                id: i.id,
                menuItemId: i.menuItemId,
                name: i.name,
                qty: i.qty,
                unitPrice: i.unitPrice,
                status: i.status,
              }))}
          />
          )}
          {splitOpen && (
          <SplitBillModal
            isOpen={splitOpen}
            onClose={() => setSplitOpen(false)}
            items={currentItems.filter(i => i.status !== 'Voided').map(i => ({
              id: i.id,
              name: i.name,
              qty: i.qty,
              price: i.unitPrice,
              menuItemId: i.menuItemId,
              size: i.size,
              notes: i.notes,
            }))}
            total={currentTotal}
            tableId={selectedTable.id}
            tableLabel={selectedTable.label}
            guestCount={Math.max(1, selectedTable.guests ?? 1)}
            onSplitComplete={() => void handleSplitComplete()}
            onBillCheckPrinted={() => {
              void fetchTables({ silent: true });
              if (selectedTable) void fetchOrderForTable(selectedTable.id);
            }}
          />
          )}
          {transferOpen && (
          <TransferTableModal
            isOpen={transferOpen}
            onClose={() => setTransferOpen(false)}
            sourceTable={selectedTable}
            tables={tables}
            zones={zoneCatalog}
            onTransferred={targetId => void handleTableTransferred(targetId)}
          />
          )}
        </>
      )}
      {newTableOpen && (
      <NewTableDrawer
        isOpen={newTableOpen}
        onClose={() => setNewTableOpen(false)}
        onTableAdded={handleTableAdded}
        defaultZoneId={zoneFilter !== 'all' ? zoneFilter : visibleZoneId}
      />
      )}
    </div>
  );
}