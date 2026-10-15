import { clearAuthToken, getApiBaseUrl, getAuthToken } from './config';
import { mapMenuItems } from './mappers';
import { normalizeOrderDetailResponse } from './paymentDetailMapper';
import type {
  LoginRequest, LoginResponse, ManagerPinVerifyRequest, ManagerPinVerifyResponse,
  StaffUser, CreateUserRequest, UpdateUserRequest,
  ZoneData, ZonePrinter, CreateZonePrinterRequest, UpdateZonePrinterRequest,
  KitchenPrinter, CategoryPrintersResponse, CategoryKitchenPrinter,
  CreateZoneRequest, UpdateZoneRequest,
  TableData, CreateTableRequest, TableLayoutUpdate, MergeTablesRequest, MergeTablesResponse,
  TransferTableRequest, TransferTableResponse,
  Booking, CreateBookingRequest, UpdateBookingRequest,
  StockItem, UpdateStockCountRequest, BulkStockUpdateRequest,
  StockHistoryEntry, StockReconcileRequest, StockReconcileResponse,
  KDSTicket, KDSStatus, TableOrder, AddOrderItemsRequest, AddOrderItemsResponse, VoidOrderItemRequest,
  ApiMenuItem, MenuCategory, MenuItem, CreateMenuCategoryRequest,
  ProcessPaymentRequest, ProcessPaymentResponse, ReceiptResponse, SplitPaymentRequest, SplitPaymentResponse,
  ShiftSummary, OpenShiftRequest, CloseShiftRequest, CloseShiftResponse,
  HourlyRevenue, RecentTransaction, DrawerReconcileRequest, DrawerReconcileResponse,
  DashboardKpiSummary, DashboardSummary, ZoneRevenue, TopItem, PaymentBreakdown, HourlyZoneRevenue,
  AppNotification, UnreadCountResponse,
  VenueConfig, PrinterTestResponse,
  AnalyticsSummary, AnalyticsQueryParams, AnalyticsTransaction, AnalyticsTransactionDetail,
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      clearAuthToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    }

    let errorMessage = `API error ${res.status}: ${res.statusText}`;
    try {
      const errBody = await res.json();
      errorMessage = errBody?.message ?? errorMessage;
    } catch { /* ignore */ }
    throw new Error(errorMessage);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
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
  resetPassword: (id: string, newPassword: string) =>
    patch<{ message: string }>(`/users/${id}/password`, { newPassword }),
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
  list: () => get<ZoneData[]>('/zones'),
  get: (id: string) => get<ZoneData>(`/zones/${id}`),
  create: (data: CreateZoneRequest) => post<ZoneData>('/zones', data),
  update: (id: string, data: UpdateZoneRequest) => put<ZoneData>(`/zones/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/zones/${id}`),
  toggle: (id: string) => patch<ZoneData>(`/zones/${id}/toggle`),
  /** @deprecated use toggle */
  toggleActive: (id: string) => patch<ZoneData>(`/zones/${id}/toggle`),
  getPrinters: (zoneId: string) => get<ZonePrinter[]>(`/zones/${zoneId}/printers`),
  addPrinter: (zoneId: string, data: CreateZonePrinterRequest) =>
    post<ZonePrinter>(`/zones/${zoneId}/printers`, data),
  updatePrinter: (zoneId: string, printerId: string, data: UpdateZonePrinterRequest) =>
    put<ZonePrinter>(`/zones/${zoneId}/printers/${printerId}`, data),
  deletePrinter: (zoneId: string, printerId: string) =>
    del<{ message: string }>(`/zones/${zoneId}/printers/${printerId}`),
  testPrinter: (zoneId: string, printerId: string) =>
    post<PrinterTestResponse>(`/zones/${zoneId}/printers/${printerId}/test`),
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
  update: (id: string, data: Partial<CreateTableRequest>) => put<TableData>(`/tables/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/tables/${id}`),
  updateStatus: (id: string, data: { status: TableData['status']; guests?: number; staff?: string }) =>
    patch<TableData>(`/tables/${id}/status`, data),
  updatePosition: (id: string, x: number, y: number) =>
    patch<TableData>(`/tables/${id}/position`, { x, y }),
  updateLayout: (updates: TableLayoutUpdate[]) =>
    patch<TableData[]>('/tables/layout', { updates }),
  merge: (data: MergeTablesRequest) => post<MergeTablesResponse>('/tables/merge', data),
  transfer: (data: TransferTableRequest) => post<TransferTableResponse>('/tables/transfer', data),
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: { tableId?: string; status?: string }) => get<TableOrder[]>('/orders', params),
  get: (tableId: string) => get<TableOrder>(`/orders/${tableId}`),
  addItems: (tableId: string, data: AddOrderItemsRequest) =>
    post<AddOrderItemsResponse>(`/orders/${tableId}/items`, data),
  voidItem: (tableId: string, itemId: string, data: VoidOrderItemRequest) =>
    patch<{ id: string; status: string }>(`/orders/${tableId}/items/${itemId}/void`, data),
  clear: (tableId: string) => del<{ message: string }>(`/orders/${tableId}`),
  getDetails: async (orderId: string) => {
    const raw = await get<Record<string, unknown>>(`/orders/details/${encodeURIComponent(orderId)}`);
    const detail = normalizeOrderDetailResponse(raw);
    return {
      orderId: detail.orderId ?? orderId,
      tableId: detail.tableId,
      tableLabel: detail.tableLabel,
      zoneLabel: detail.zoneLabel,
      covers: detail.covers,
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

// ─── Menu ─────────────────────────────────────────────────────────────────────
export const menuCategoryApi = {
  list: () => get<MenuCategory[]>('/menu/categories'),
  get: (id: string) => get<MenuCategory>(`/menu/categories/${id}`),
  create: (data: CreateMenuCategoryRequest) =>
    post<MenuCategory>('/menu/categories', data),
  update: (id: string, data: Partial<CreateMenuCategoryRequest>) =>
    put<MenuCategory>(`/menu/categories/${id}`, data),
  delete: (id: string) => del<void>(`/menu/categories/${id}`),
  getPrinters: (categoryId: string) =>
    get<CategoryPrintersResponse>(`/menu/categories/${categoryId}/printers`),
  setPrinters: (categoryId: string, printers: CategoryKitchenPrinter[]) =>
    put<CategoryPrintersResponse>(`/menu/categories/${categoryId}/printers`, { printers }),
};

export const menuApi = {
  list: (categoryId?: string) =>
    get<ApiMenuItem[]>('/menu', categoryId ? { categoryId } : undefined),
  categories: () => get<MenuCategory[]>('/menu/categories'),
  items: async (categoryId?: string): Promise<MenuItem[]> => {
    const items = await get<ApiMenuItem[]>('/menu', categoryId ? { categoryId } : undefined);
    const mapped = mapMenuItems(items);
    if (!categoryId) return mapped;
    return mapped.filter(
      (i) => i.categoryId === categoryId || i.category === categoryId,
    );
  },
  create: (data: Partial<ApiMenuItem>) => post<ApiMenuItem>('/menu', data),
  update: (id: string, data: Partial<ApiMenuItem>) => put<ApiMenuItem>(`/menu/${id}`, data),
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
export const analyticsApi = {
  summary: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary>('/analytics/summary', params as Record<string, string | number | boolean | undefined>),
  hourlyRevenue: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['hourlyRevenue']>('/analytics/hourly-revenue', params as Record<string, string | number | boolean | undefined>),
  topItems: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['topItems']>('/analytics/top-items', params as Record<string, string | number | boolean | undefined>),
  tableTurnover: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['tableTurnover']>('/analytics/table-turnover', params as Record<string, string | number | boolean | undefined>),
  staffPerformance: (params?: AnalyticsQueryParams) =>
    get<AnalyticsSummary['staffPerformance']>('/analytics/staff-performance', params as Record<string, string | number | boolean | undefined>),
  transactions: (params?: AnalyticsQueryParams) =>
    get<AnalyticsTransaction[]>('/analytics/transactions', params as Record<string, string | number | boolean | undefined>),
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
