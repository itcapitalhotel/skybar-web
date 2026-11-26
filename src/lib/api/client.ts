import { clearAuthToken, getApiBaseUrl, getAuthToken } from './config';
import { compareMenuItemId, khmerNameOf, mapMenuItems, normalizeZone, normalizeZoneList } from './mappers';
import { normalizeCategoryType } from '@/lib/menuCategory';
import { normalizeOrderDetailResponse } from './paymentDetailMapper';
import type {
  LoginRequest, LoginResponse, ManagerPinVerifyRequest, ManagerPinVerifyResponse,
  StaffUser, CreateUserRequest, UpdateUserRequest,
  ZoneData, ZonePrinter, CreateZonePrinterRequest, UpdateZonePrinterRequest,
  CreateZoneKitchenPrinterRequest,
  KitchenPrinter, CategoryPrinterMapping, CategoryPrintersResponse, CategoryKitchenPrinter,
  CreateZoneRequest, UpdateZoneRequest,
  TableData, CreateTableRequest, TableLayoutUpdate, MergeTablesRequest, MergeTablesResponse,
  OrderType,
  TransferTableRequest, TransferTableResponse,
  SplitTableRequest, SplitTableResponse,
  Booking, CreateBookingRequest, UpdateBookingRequest,
  StockItem, UpdateStockCountRequest, BulkStockUpdateRequest,
  StockHistoryEntry, StockReconcileRequest, StockReconcileResponse,
  KDSTicket, KDSStatus, TableOrder, OrderItem, AddOrderItemsRequest, AddOrderItemsResponse,
  UpdateOrderItemRequest, UpdateClosedOrderRequest, VoidOrderItemRequest, VoidReportLine,
  ApiMenuItem, MenuCategory, MenuItem, CreateMenuCategoryRequest, UpdateMenuCategoryRequest,
  ProcessPaymentRequest, ProcessPaymentResponse, ReceiptResponse, PrintReceiptRequest, PrintReceiptResponse,
  PrintSplitReceiptRequest, PrintSplitReceiptResponse,
  SplitPaymentRequest, SplitPaymentResponse,
  ShiftSummary, OpenShiftRequest, CloseShiftRequest, CloseShiftResponse,
  HourlyRevenue, RecentTransaction, DrawerReconcileRequest, DrawerReconcileResponse,
  DashboardKpiSummary, DashboardSummary, ZoneRevenue, TopItem, PaymentBreakdown, HourlyZoneRevenue,
  AppNotification, UnreadCountResponse,
  VenueConfig, PrinterTestResponse, PrintLongReportRequest, PrintLongReportResponse,
  AnalyticsSummary, AnalyticsQueryParams, AnalyticsTransaction, AnalyticsTransactionDetail,
  AnalyticsRevenueSeriesPoint, AnalyticsZoneRevenue,
  OrderDetailsResponse,
  SetPinRequest, PinVerifyResponse,
  StaffShift, CreateShiftRequest, StaffAvailability, KdsAssignment,
} from './types';

// ─── Core HTTP Client ─────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${getApiBaseUrl()}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

/**
 * Short caches for reads that do not change every second.
 * Tables, orders, bookings, payments, shifts, and the live floor stay uncached.
 */
const GET_CACHE_RULES: { prefix: string; ttl: number }[] = [
  { prefix: '/auth/me', ttl: 60_000 },
  { prefix: '/zones', ttl: 60_000 },
  { prefix: '/menu', ttl: 120_000 },
  { prefix: '/config', ttl: 60_000 },
  { prefix: '/order-types', ttl: 120_000 },
  { prefix: '/kitchen-printers', ttl: 60_000 },
  { prefix: '/users', ttl: 30_000 },
  { prefix: '/roster', ttl: 30_000 },
  { prefix: '/analytics', ttl: 20_000 },
  { prefix: '/dashboard', ttl: 12_000 },
];

const responseCache = new Map<string, { at: number; data: unknown }>();
const inflightGets = new Map<string, Promise<unknown>>();

function cacheTtl(path: string): number {
  const rule = GET_CACHE_RULES.find((entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`));
  return rule?.ttl ?? 0;
}

function invalidateResponseCache(path: string) {
  const root = `/${path.split('/').filter(Boolean)[0] ?? ''}`;
  const refreshReports = root === '/payments' || root === '/orders' || root === '/tables' || root === '/shifts' || root === '/menu';
  for (const key of responseCache.keys()) {
    if (key.includes(root) || (refreshReports && (key.includes('/analytics') || key.includes('/dashboard')))) {
      responseCache.delete(key);
    }
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;
  const token = getAuthToken();
  const url = buildUrl(path, params);
  const cacheKey = `${method} ${url}`;
  const ttl = method === 'GET' ? cacheTtl(path) : 0;

  if (ttl > 0) {
    const hit = responseCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  }

  if (method === 'GET') {
    const pending = inflightGets.get(cacheKey);
    if (pending) return pending as Promise<T>;
  } else {
    invalidateResponseCache(path);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const pending = fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    if (!res.ok) {
      if (res.status === 401 && typeof window !== 'undefined') {
        responseCache.clear();
        clearAuthToken();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
      }

      let errorMessage = `API error ${res.status}: ${res.statusText} (${method} ${path})`;
      try {
        const errBody = await res.json() as { message?: string; error?: string };
        const fromBody = errBody?.message ?? errBody?.error;
        if (typeof fromBody === 'string' && fromBody.trim()) errorMessage = fromBody;
      } catch { /* keep the status line */ }
      return Promise.reject(new Error(errorMessage));
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  });

  // Attach a handler on this promise itself. A failure that the caller already
  // catches was still opening the Next.js error screen.
  pending.catch(() => {});

  if (method === 'GET') {
    inflightGets.set(cacheKey, pending);
    pending.finally(() => {
      if (inflightGets.get(cacheKey) === pending) inflightGets.delete(cacheKey);
    }).catch(() => {});
  }

  const data = await pending;
  if (ttl > 0) responseCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

const get = <T>(path: string, params?: RequestOptions['params']) => request<T>(path, { method: 'GET', params });
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
const put = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body });
const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: LoginRequest) => post<LoginResponse>('/auth/login', data),
  logout: () => post<{ message: string }>('/auth/logout'),
  refresh: (refreshToken: string) => post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken }),
  me: () => get<StaffUser>('/auth/me'),
  verifyManagerPin: (data: ManagerPinVerifyRequest) =>
    post<ManagerPinVerifyResponse>('/auth/manager-pin/verify', data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params?: { role?: string; status?: string }) => get<StaffUser[]>('/users', params),
  get: (id: string) => get<StaffUser>(`/users/${id}`),
  create: (data: CreateUserRequest) => post<StaffUser>('/users', data),
  update: (id: string, data: UpdateUserRequest) => put<StaffUser>(`/users/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/users/${id}`),
  toggleStatus: (id: string) => patch<StaffUser>(`/users/${id}/status`, { status: 'active' }),
  /** @deprecated use toggleStatus */
  setStatus: (id: string, status: string) => patch<StaffUser>(`/users/${id}/status`, { status }),
  /** Accepts 4+ char PIN/password; API syncs StaffPin + passwordHash. */
  resetPassword: (id: string, password: string) =>
    patch<{ message: string }>(`/users/${id}/password`, { password, newPassword: password }),
};

// ─── Staff (with PIN) ─────────────────────────────────────────────────────────
export const staffApi = {
  list: () => get<StaffUser[]>('/staff'),
  get: (id: string) => get<StaffUser>(`/staff/${id}`),
  create: (data: CreateUserRequest) => post<StaffUser>('/staff', data),
  update: (id: string, data: UpdateUserRequest) => put<StaffUser>(`/staff/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/staff/${id}`),
  toggleStatus: (id: string) => patch<StaffUser>(`/staff/${id}/toggle-status`),
  setPin: (staffId: string, data: SetPinRequest) =>
    post<{ success: boolean; message: string }>(`/staff/${staffId}/pin`, data),
  verifyPin: (staffId: string, data: SetPinRequest) =>
    post<PinVerifyResponse>(`/staff/${staffId}/pin/verify`, data),
  removePin: (staffId: string) => del<{ success: boolean; message: string }>(`/staff/${staffId}/pin`),
};

// ─── Zones ────────────────────────────────────────────────────────────────────
export const zonesApi = {
  list: async () => normalizeZoneList(await get<unknown>('/zones')),
  get: async (id: string) => {
    const zone = normalizeZone(await get<unknown>(`/zones/${id}`));
    if (!zone) throw new Error('Zone not found');
    return zone;
  },
  create: async (data: CreateZoneRequest) => {
    const created = normalizeZone(await post<unknown>('/zones', data));
    if (created) return created;
    const list = await zonesApi.list();
    const match = list.find((z) => z.label === data.label);
    if (match) return match;
    throw new Error('Zone was created but could not be read back');
  },
  update: async (id: string, data: UpdateZoneRequest) => {
    const updated = normalizeZone(await put<unknown>(`/zones/${id}`, data));
    if (updated) return updated;
    return zonesApi.get(id);
  },
  delete: (id: string) => del<void>(`/zones/${id}`),
  toggle: async (id: string) => {
    const updated = normalizeZone(await patch<unknown>(`/zones/${id}/toggle`));
    if (updated) return updated;
    return zonesApi.get(id);
  },
  /** @deprecated use toggle */
  toggleActive: (id: string) => zonesApi.toggle(id),
  getPrinters: (zoneId: string) => get<ZonePrinter[]>(`/zones/${zoneId}/printers`),
  addPrinter: (zoneId: string, data: CreateZonePrinterRequest) =>
    post<ZonePrinter>(`/zones/${zoneId}/printers`, data),
  updatePrinter: (zoneId: string, printerId: string, data: UpdateZonePrinterRequest) =>
    put<ZonePrinter>(`/zones/${zoneId}/printers/${printerId}`, data),
  deletePrinter: (zoneId: string, printerId: string) =>
    del<{ message: string }>(`/zones/${zoneId}/printers/${printerId}`),
  testPrinter: (zoneId: string, printerId: string) =>
    post<PrinterTestResponse>(`/zones/${zoneId}/printers/${printerId}/test`),
  getKitchenPrinters: (zoneId: string) =>
    get<ZonePrinter[]>(`/zones/${zoneId}/kitchen-printers`),
  addKitchenPrinter: (zoneId: string, data: CreateZoneKitchenPrinterRequest) =>
    post<ZonePrinter>(`/zones/${zoneId}/kitchen-printers`, data),
  updateKitchenPrinter: (zoneId: string, printerId: string, data: CreateZoneKitchenPrinterRequest) =>
    put<ZonePrinter>(`/zones/${zoneId}/kitchen-printers/${printerId}`, data),
  deleteKitchenPrinter: (zoneId: string, printerId: string) =>
    del<{ message: string }>(`/zones/${zoneId}/kitchen-printers/${printerId}`),
  testKitchenPrinter: (zoneId: string, printerId: string) =>
    post<PrinterTestResponse>(`/zones/${zoneId}/kitchen-printers/${printerId}/test`),
};

// ─── Kitchen printers (global list for picker — not receipt zone_printers) ───
export const kitchenPrintersApi = {
  list: () => get<KitchenPrinter[]>('/kitchen-printers'),
};

// ─── Tables ───────────────────────────────────────────────────────────────────
export const tablesApi = {
  list: (zone?: string) => get<TableData[]>('/tables', zone ? { zone } : undefined),
  get: (id: string) => get<TableData>(`/tables/${id}`),
  create: (data: CreateTableRequest) => post<TableData>('/tables', data),
  update: (id: string, data: Partial<CreateTableRequest> & { scale?: number }) => put<TableData>(`/tables/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/tables/${id}`),
  updateStatus: (
    id: string,
    data: {
      status: TableData['status'];
      guestCount?: number;
      guests?: number;
      staff?: string;
      orderTypeId?: string;
    },
  ) => {
    // Backend UpdateTableStatusRequest expects `guests` (not guestCount).
    const party = data.guests ?? data.guestCount;
    return patch<TableData>(`/tables/${id}/status`, {
      status: data.status,
      ...(data.staff != null ? { staff: data.staff } : {}),
      ...(party != null ? { guests: party } : {}),
      ...(data.orderTypeId ? { orderTypeId: data.orderTypeId } : {}),
    });
  },
  updatePosition: (id: string, x: number, y: number) =>
    patch<TableData>(`/tables/${id}/position`, { x, y }),
  updateLayout: (updates: TableLayoutUpdate[]) =>
    patch<TableData[]>('/tables/layout', { updates }),
  merge: (data: MergeTablesRequest) => post<MergeTablesResponse>('/tables/merge', data),
  transfer: (data: TransferTableRequest) => post<TransferTableResponse>('/tables/transfer', data),
  split: (data: SplitTableRequest) => post<SplitTableResponse>('/tables/split', data),
};

function mapOrderLine(row: unknown): OrderItem {
  const raw = (row ?? {}) as Record<string, unknown>;
  const status = String(raw.status ?? 'Queued');
  return {
    id: String(raw.id ?? raw.itemId ?? raw.item_id ?? ''),
    menuItemId: raw.menuItemId != null ? String(raw.menuItemId) : raw.menu_item_id != null ? String(raw.menu_item_id) : undefined,
    categoryId: raw.categoryId != null ? String(raw.categoryId) : undefined,
    name: String(raw.name ?? ''),
    khmerName: raw.khmerName != null && String(raw.khmerName).trim()
      ? String(raw.khmerName).trim()
      : raw.khmer_name != null && String(raw.khmer_name).trim()
        ? String(raw.khmer_name).trim()
        : undefined,
    qty: Number(raw.qty ?? 1),
    unitPrice: Number(raw.unitPrice ?? raw.unit_price ?? 0),
    status: (status === 'In_Prep' ? 'In Prep' : status) as OrderItem['status'],
    notes: (() => {
      const text = raw.notes ?? raw.note;
      if (text == null) return undefined;
      const trimmed = String(text).trim();
      return trimmed || undefined;
    })(),
    size: raw.size != null ? String(raw.size) : undefined,
  };
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orderTypesApi = {
  list: () => get<OrderType[]>('/order-types'),
};

export const ordersApi = {
  list: (params?: { tableId?: string; status?: string }) => get<TableOrder[]>('/orders', params),
  listVoids: (params?: { from?: string; to?: string }) => get<VoidReportLine[]>('/orders/voids', params),
  get: async (tableId: string): Promise<TableOrder> => {
    const raw = await get<Record<string, unknown>>(`/orders/${tableId}`);
    const items = Array.isArray(raw.items) ? raw.items.map((row) => mapOrderLine(row)) : [];
    return {
      tableId: String(raw.tableId ?? tableId),
      orderId: raw.orderId != null ? String(raw.orderId) : raw.order_id != null ? String(raw.order_id) : undefined,
      guestCount: Number(raw.guestCount ?? raw.guest_count) || undefined,
      orderTypeId: raw.orderTypeId != null ? String(raw.orderTypeId) : raw.order_type_id != null ? String(raw.order_type_id) : undefined,
      orderTypeName: raw.orderTypeName != null ? String(raw.orderTypeName) : raw.order_type_name != null ? String(raw.order_type_name) : undefined,
      note: (() => {
        const text = raw.note ?? raw.orderNote ?? raw.order_note;
        if (text == null) return undefined;
        const trimmed = String(text).trim();
        return trimmed || undefined;
      })(),
      items,
      subtotal: Number(raw.subtotal ?? 0),
      serviceCharge: Number(raw.serviceCharge ?? raw.service_charge ?? 0),
      vat: Number(raw.vat ?? 0),
      total: Number(raw.total ?? 0),
    };
  },
  addItems: async (tableId: string, data: AddOrderItemsRequest): Promise<AddOrderItemsResponse> => {
    const raw = await post<AddOrderItemsResponse>(`/orders/${tableId}/items`, data);
    return {
      ...raw,
      addedItems: (raw.addedItems ?? []).map((row) => mapOrderLine(row)).filter((row) => row.id.length > 0),
    };
  },
  updateItem: async (tableId: string, itemId: string, data: UpdateOrderItemRequest) => {
    const raw = await patch<unknown>(`/orders/${tableId}/items/${encodeURIComponent(itemId)}`, data);
    return mapOrderLine(raw);
  },
  voidItem: (tableId: string, itemId: string, data: VoidOrderItemRequest) =>
    patch<{ id: string; status: string }>(`/orders/${tableId}/items/${encodeURIComponent(itemId)}/void`, data),
  clear: (tableId: string) => del<{ message: string }>(`/orders/${tableId}`),
  getDetails: async (orderId: string) => {
    const raw = await get<Record<string, unknown>>(`/orders/details/${encodeURIComponent(orderId)}`);
    const detail = normalizeOrderDetailResponse(raw);
    return {
      orderId: detail.orderId ?? orderId,
      tableId: detail.tableId,
      tableLabel: detail.tableLabel,
      zoneLabel: detail.zoneLabel,
      status: typeof raw.status === 'string' ? raw.status : undefined,
      covers: detail.covers ?? detail.guestCount,
      orderTypeId: detail.orderTypeId,
      orderTypeName: detail.orderTypeName,
      paymentId: detail.paymentId || undefined,
      method: detail.method,
      roomNumber: detail.roomNumber,
      cardName: detail.cardName,
      cardNumber: detail.cardNumber,
      tip: detail.tip,
      cashTendered: detail.cashTendered,
      openedAt: detail.openedAt,
      closedAt: detail.closedAt,
      staffId: detail.staffId,
      staffName: detail.staffName,
      staffRole: detail.staffRole,
      legacyPayment: detail.legacyPayment,
      subtotal: detail.subtotal ?? 0,
      serviceCharge: detail.serviceCharge ?? 0,
      vat: detail.vat ?? 0,
      total: detail.total ?? detail.amount,
      discount: detail.discount,
      items: detail.items ?? [],
      payments: detail.payments,
      merge: detail.merge,
      split: detail.split,
      hasMerge: detail.hasMerge,
      hasSplit: detail.hasSplit,
      merges: detail.merges,
      splits: detail.splits,
      hasTransfer: detail.hasTransfer,
      transfers: detail.transfers,
    } satisfies OrderDetailsResponse;
  },
  /** Correct payment on a paid order. The order stays closed. */
  updateClosed: (orderId: string, data: UpdateClosedOrderRequest) =>
    patch<OrderDetailsResponse>(`/orders/${encodeURIComponent(orderId)}`, data),
  /** Paid order returns to active. The old payment is removed. */
  reopen: (orderId: string) =>
    post<OrderDetailsResponse>(`/orders/${encodeURIComponent(orderId)}/reopen`),
};

// ─── Bookings ─────────────────────────────────────────────────────────────────
export const bookingsApi = {
  list: (params?: { date?: string; zone?: string; status?: string }) =>
    get<Booking[]>('/bookings', params),
  get: (id: string) => get<Booking>(`/bookings/${id}`),
  create: (data: CreateBookingRequest) => post<Booking>('/bookings', data),
  update: (id: string, data: UpdateBookingRequest) => put<Booking>(`/bookings/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/bookings/${id}`),
  seat: (id: string) => patch<Booking>(`/bookings/${id}/seat`),
  cancel: (id: string) => patch<Booking>(`/bookings/${id}/cancel`),
  upcomingReminders: () => get<Booking[]>('/bookings/reminders/upcoming'),
  testReminder: (id: string) => post<{ message: string; bookingId: string }>(`/bookings/${id}/reminder/test`),
};

// ─── Stock ────────────────────────────────────────────────────────────────────
export const stockApi = {
  list: (params?: { category?: string; status?: string }) => get<StockItem[]>('/stock', params),
  get: (id: string) => get<StockItem>(`/stock/${id}`),
  alerts: () => get<StockItem[]>('/stock/alerts'),
  history: (id: string, params?: { limit?: number; from?: string; to?: string }) =>
    get<StockHistoryEntry[]>(`/stock/${id}/history`, params),
  create: (data: Omit<StockItem, 'id'>) => post<StockItem>('/stock', data),
  update: (id: string, data: Partial<StockItem>) => put<StockItem>(`/stock/${id}`, data),
  updateCount: (id: string, data: UpdateStockCountRequest) => patch<StockItem>(`/stock/${id}/count`, data),
  bulkUpdate: (data: BulkStockUpdateRequest) => post<StockItem[]>('/stock/bulk-update', data),
  reconcile: (data: StockReconcileRequest) => post<StockReconcileResponse>('/stock/reconcile', data),
  reconciliations: (params?: { shiftId?: string; from?: string; to?: string }) =>
    get<StockReconcileResponse[]>('/stock/reconciliations', params),
  getReconciliation: (id: string) => get<StockReconcileResponse>(`/stock/reconciliations/${id}`),
  delete: (id: string) => del<{ message: string }>(`/stock/${id}`),
};

// ─── KDS ──────────────────────────────────────────────────────────────────────
export const kdsApi = {
  tickets: (status?: KDSStatus) => get<KDSTicket[]>('/kds/tickets', status ? { status } : undefined),
  advance: (id: string) => patch<KDSTicket>(`/kds/tickets/${id}/advance`),
  recall: (id: string) => patch<KDSTicket>(`/kds/tickets/${id}/recall`),
  remove: (id: string) => del<{ message: string }>(`/kds/tickets/${id}`),
};

function mapMenuCategory(raw: Record<string, unknown>): MenuCategory {
  const categoryType =
    normalizeCategoryType(raw.categoryType)
    ?? normalizeCategoryType(raw.type)
    ?? 'drink';
  return {
    id: String(raw.id ?? ''),
    label: String(raw.label ?? ''),
    icon: String(raw.icon ?? '🍸'),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : undefined,
    isActive: raw.isActive !== false,
    categoryType,
  };
}

/**
 * Build POST/PUT body for menu categories.
 * - Send only `categoryType` — never `type` (Jackson UpdateMenuCategoryRequest 500s on `type`).
 * - Omit null/undefined (e.g. `"sortOrder": null` also 500s).
 */
function categoryBody(data: CreateMenuCategoryRequest | UpdateMenuCategoryRequest): Record<string, unknown> {
  const raw = data as Record<string, unknown>;
  const categoryType = normalizeCategoryType(raw.categoryType ?? raw.type);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'categoryType' || key === 'type') continue;
    if (value === undefined || value === null) continue;
    if (key === 'sortOrder' && typeof value === 'number' && Number.isNaN(value)) continue;
    body[key] = value;
  }
  if (categoryType) {
    body.categoryType = categoryType;
  }
  return body;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
export const menuCategoryApi = {
  list: async () => {
    const rows = await get<Record<string, unknown>[]>('/menu/categories');
    return rows.map(mapMenuCategory);
  },
  get: async (id: string) => {
    const raw = await get<Record<string, unknown>>(`/menu/categories/${encodeURIComponent(id)}`);
    return mapMenuCategory(raw);
  },
  create: async (data: CreateMenuCategoryRequest) => {
    const raw = await post<Record<string, unknown>>('/menu/categories', categoryBody(data));
    return mapMenuCategory(raw);
  },
  update: async (id: string, data: UpdateMenuCategoryRequest) => {
    const raw = await put<Record<string, unknown>>(
      `/menu/categories/${encodeURIComponent(id)}`,
      categoryBody(data),
    );
    return mapMenuCategory(raw);
  },
  delete: (id: string) => del<void>(`/menu/categories/${id}`),
  getPrinterMappings: () =>
    get<CategoryPrinterMapping[]>('/menu/category-printers/mappings'),
  /** Preferred GET for one admin tab — scoped to categoryId only */
  getCategoryPrinters: (categoryId: string) =>
    get<CategoryPrintersResponse>(`/menu/category-printers/${categoryId}`),
  /** Alternate path — same wrapped `{ categoryId, printers }` shape */
  getPrinters: (categoryId: string) =>
    get<CategoryPrintersResponse>(`/menu/categories/${categoryId}/printers`),
  setPrinters: (categoryId: string, printers: CategoryKitchenPrinter[]) =>
    put<CategoryPrintersResponse>(`/menu/categories/${categoryId}/printers`, { printers }),
  /** Admin tab load: preferred path, falls back to /menu/categories/{id}/printers */
  loadCategoryPrintersView: async (categoryId: string): Promise<CategoryPrintersResponse> => {
    try {
      return await get<CategoryPrintersResponse>(`/menu/category-printers/${categoryId}`);
    } catch {
      return get<CategoryPrintersResponse>(`/menu/categories/${categoryId}/printers`);
    }
  },
};

function withKhmerName<T extends ApiMenuItem>(item: T): T {
  return { ...item, khmerName: khmerNameOf(item) ?? null };
}

export const menuApi = {
  list: async (categoryId?: string) => {
    const items = await get<ApiMenuItem[]>('/menu', categoryId ? { categoryId } : undefined);
    return [...items].map(withKhmerName).sort((a, b) => compareMenuItemId(a.id, b.id));
  },
  categories: () => menuCategoryApi.list(),
  items: async (categoryId?: string): Promise<MenuItem[]> => {
    const items = await get<ApiMenuItem[]>('/menu', categoryId ? { categoryId } : undefined);
    const mapped = mapMenuItems(items);
    if (!categoryId) return mapped;
    return mapped.filter(
      (i) => i.categoryId === categoryId || i.category === categoryId,
    );
  },
  create: async (data: Partial<ApiMenuItem>) => withKhmerName(await post<ApiMenuItem>('/menu', data)),
  update: async (id: string, data: Partial<ApiMenuItem>) => withKhmerName(await put<ApiMenuItem>(`/menu/${id}`, data)),
  delete: (id: string) => del<{ message: string }>(`/menu/${id}`),
  setAvailability: (id: string, available: boolean) =>
    patch<{ id: string; available: boolean }>(`/menu/${id}/availability`, { available }),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  process: (data: ProcessPaymentRequest) => post<ProcessPaymentResponse>('/payments', data),
  split: (data: SplitPaymentRequest) => post<SplitPaymentResponse>('/payments/split', data),
  getReceipt: (paymentId: string) =>
    get<ReceiptResponse>(`/receipts/${encodeURIComponent(paymentId)}`),
};

// ─── Receipts ─────────────────────────────────────────────────────────────────
export const receiptsApi = {
  /** Guest bill before payment (`tableId`) or reprint after payment (`paymentId`). */
  print: (data: PrintReceiptRequest) => post<PrintReceiptResponse>('/receipts/print', data),
  /** Unpaid split bill checks — one slip per guest; does not create payments. */
  printSplit: (data: PrintSplitReceiptRequest) =>
    post<PrintSplitReceiptResponse>('/receipts/print-split', data),
  get: (paymentId: string) =>
    get<ReceiptResponse>(`/receipts/${encodeURIComponent(paymentId)}`),
};

// ─── Shifts ───────────────────────────────────────────────────────────────────
export const shiftApi = {
  current: () => get<ShiftSummary>('/shifts/current'),
  open: (data: OpenShiftRequest) => post<ShiftSummary>('/shifts/open', data),
  close: (data: CloseShiftRequest) => post<CloseShiftResponse>('/shifts/close', data),
  transactions: (shiftId: string) => get<RecentTransaction[]>(`/shifts/${shiftId}/transactions`),
  reconcileDrawer: (data: DrawerReconcileRequest) =>
    post<DrawerReconcileResponse>('/shifts/drawer/reconcile', data),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => get<DashboardKpiSummary>('/dashboard/summary'),
  zoneRevenue: () => get<ZoneRevenue[]>('/dashboard/zone-revenue'),
  topItems: () => get<TopItem[]>('/dashboard/top-items'),
  paymentBreakdown: () => get<PaymentBreakdown[]>('/dashboard/payment-breakdown'),
  hourlyRevenue: () => get<HourlyZoneRevenue[]>('/dashboard/hourly-revenue'),
  /** Aggregate all dashboard panels */
  full: async (): Promise<DashboardSummary> => {
    const [zoneRevenue, topItems, paymentBreakdown, hourlyData, kpi] = await Promise.all([
      dashboardApi.zoneRevenue(),
      dashboardApi.topItems(),
      dashboardApi.paymentBreakdown(),
      dashboardApi.hourlyRevenue(),
      dashboardApi.summary(),
    ]);
    return {
      zoneRevenue,
      topItems,
      paymentBreakdown,
      hourlyData,
      activeTables: kpi.activeTables,
      awaitingBill: kpi.tablesAwaitingBill,
    };
  },
};

// ─── Notifications ──────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: { type?: string; read?: boolean }) => get<AppNotification[]>('/notifications', params),
  unreadCount: () => get<UnreadCountResponse>('/notifications/unread-count'),
  markRead: (id: string) => patch<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => patch<{ message: string; updatedCount: number }>('/notifications/read-all'),
  dismiss: (id: string) => del<{ message: string }>(`/notifications/${id}`),
  clearRead: () => del<{ message: string; deletedCount: number }>('/notifications/clear-read'),
  create: (data: Omit<AppNotification, 'id' | 'read'> & { targetRoles?: string[] }) =>
    post<AppNotification>('/notifications', data),
};

// ─── Config ───────────────────────────────────────────────────────────────────
export const configApi = {
  get: () => get<VenueConfig>('/config'),
  update: (data: Partial<VenueConfig>) => put<{ message: string; updatedAt: string }>('/config', data),
  testPrinter: (printerIp: string, printerPort: number | string) =>
    post<PrinterTestResponse>('/config/printer/test', { printerIp, printerPort: Number(printerPort) }),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
const analyticsParams = (params?: AnalyticsQueryParams) =>
  params as Record<string, string | number | boolean | undefined>;

export const analyticsApi = {
  summary: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary>('/analytics/summary', analyticsParams(params)),
  hourlyRevenue: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['hourlyRevenue']>('/analytics/hourly-revenue', analyticsParams(params)),
  /** Dated revenue buckets — prefer over client-side txn aggregation */
  revenueSeries: (params?: AnalyticsQueryParams) =>
    get<AnalyticsRevenueSeriesPoint[]>('/analytics/revenue-series', analyticsParams(params)),
  /** Dated zone totals (not live /dashboard/zone-revenue) */
  zoneRevenue: (params?: AnalyticsQueryParams) =>
    get<AnalyticsZoneRevenue[]>('/analytics/zone-revenue', analyticsParams(params)),
  /** Dated payment mix (not live /dashboard/payment-breakdown) */
  paymentBreakdown: (params?: AnalyticsQueryParams) =>
    get<PaymentBreakdown[]>('/analytics/payment-breakdown', analyticsParams(params)),
  topItems: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['topItems']>('/analytics/top-items', analyticsParams(params)),
  tableTurnover: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['tableTurnover']>('/analytics/table-turnover', analyticsParams(params)),
  staffPerformance: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['staffPerformance']>('/analytics/staff-performance', analyticsParams(params)),
  transactions: (params?: AnalyticsQueryParams) =>
    get<AnalyticsTransaction[]>('/analytics/transactions', analyticsParams(params)),
  /** Every check in the range, one request. */
  checkDetails: async (params?: AnalyticsQueryParams) => {
    const rows = await get<Record<string, unknown>[]>('/analytics/check-details', analyticsParams(params));
    return (rows ?? []).map((raw) => normalizeOrderDetailResponse(raw));
  },
  printLongReport: (data: PrintLongReportRequest) =>
    post<PrintLongReportResponse>('/analytics/report/print', data),
  getTransaction: async (paymentId: string) => {
    const raw = await get<Record<string, unknown>>(
      `/analytics/transactions/${encodeURIComponent(paymentId)}`,
    );
    return normalizeOrderDetailResponse({ ...raw, paymentId: raw.paymentId ?? paymentId });
  },
};

// ─── Roster ───────────────────────────────────────────────────────────────────
export const rosterApi = {
  shifts: (params?: { weekStart?: string; staffId?: string; zoneId?: string }) =>
    get<StaffShift[]>('/roster/shifts', params),
  createShift: (data: CreateShiftRequest) => post<StaffShift>('/roster/shifts', data),
  updateShift: (id: string, data: Partial<CreateShiftRequest>) => put<StaffShift>(`/roster/shifts/${id}`, data),
  deleteShift: (id: string) => del<{ message: string }>(`/roster/shifts/${id}`),
  availability: () => get<StaffAvailability[]>('/roster/availability'),
  updateAvailability: (staffId: string, data: Partial<StaffAvailability>) =>
    put<StaffAvailability>(`/roster/availability/${staffId}`, data),
  kdsAssignments: () => get<KdsAssignment[]>('/roster/kds-assignments'),
  toggleKds: (shiftId: string, kdsAssigned: boolean) =>
    patch<StaffShift>(`/roster/shifts/${shiftId}/kds`, { kdsAssigned }),
};

// Legacy aliases (deprecated — use staffApi)
export const staffPinApi = staffApi;
