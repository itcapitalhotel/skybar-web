// ─── Shared API Types (aligned with BACKEND_API.md) ───────────────────────────

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: StaffUser;
}

export interface ManagerPinVerifyRequest {
  pin: string;
  action: string;
}

export interface ManagerPinVerifyResponse {
  approved: boolean;
  approvedBy?: string;
  role?: UserRole;
}

// ── Staff / Users ─────────────────────────────────────────────────────────────
export type UserRole = 'Admin' | 'Manager' | 'Bartender' | 'Cashier';
export type UserStatus = 'active' | 'inactive' | 'on_shift';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  terminalId: string;
  avatar: string;
  joinDate?: string;
  lastActive?: string;
  shiftsThisWeek?: number;
  hasPin?: boolean;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: UserRole;
  terminalId?: string;
  password: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: UserRole;
  terminalId?: string;
}

// ── Zones ─────────────────────────────────────────────────────────────────────
export interface ZoneData {
  id: string;
  label: string;
  description: string;
  color: string;
  tableCount: number;
  capacity: number;
  isActive: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export interface ZonePrinter {
  id: string;
  zoneId: string;
  name: string;
  printerIp: string;
  printerPort: number;
  isDefault: boolean;
}

/** Kitchen station catalog (picker) — not the per-category editor list. */
export interface KitchenPrinter {
  id: string;
  name: string;
  printerIp: string;
  printerPort: number;
  /** Categories already linked to this station */
  categoryIds?: string[];
}

export interface CategoryPrinterMapping {
  categoryId: string;
  categoryLabel?: string;
  printers: CategoryKitchenPrinter[];
}

/** Row in GET/PUT /menu/categories/{categoryId}/printers */
export interface CategoryKitchenPrinter {
  id?: string;
  name: string;
  printerIp: string;
  printerPort: number;
}

export interface CategoryPrintersResponse {
  categoryId?: string;
  categoryLabel?: string;
  printers: CategoryKitchenPrinter[];
}

export interface CategoryPrintersSaveRequest {
  printers: CategoryKitchenPrinter[];
}

export interface CreateZonePrinterRequest {
  name: string;
  printerIp: string;
  printerPort: number;
  isDefault?: boolean;
}

export interface UpdateZonePrinterRequest {
  name?: string;
  printerIp?: string;
  printerPort?: number;
  isDefault?: boolean;
}

export interface CreateZoneRequest {
  label: string;
  description: string;
  color: string;
  canvasWidth: number;
  canvasHeight: number;
}

export interface UpdateZoneRequest extends Partial<CreateZoneRequest> {
  isActive?: boolean;
}

// ── Tables ────────────────────────────────────────────────────────────────────
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'bill';
export type TableShape = 'circle' | 'rect' | 'cabana' | 'stool';

export interface TableData {
  id: string;
  label: string;
  zone: string;
  status: TableStatus;
  /** Display / legacy list field */
  guests: number;
  /** Preferred API field on PATCH status responses */
  guestCount?: number;
  capacity: number;
  staff: string;
  seatedMinutes: number;
  minSpend?: number;
  orderTotal: number;
  shape: TableShape;
  x: number;
  y: number;
}

export interface CreateTableRequest {
  label: string;
  zone: string;
  capacity: number;
  shape: TableShape;
  x: number;
  y: number;
  minSpend?: number;
}

export interface TableLayoutUpdate {
  id: string;
  x: number;
  y: number;
  shape?: TableShape;
}

export interface MergeTablesRequest {
  sourceTableId: string;
  targetTableId: string;
}

export interface MergeTablesResponse {
  mergedTableId: string;
  message: string;
  combinedOrderTotal: number;
}

export interface TransferTableRequest {
  sourceTableId: string;
  targetTableId: string;
  staffId: string;
  /** Optional partial line move when backend supports it */
  itemIds?: string[] | null;
}

export interface TransferTableResponse {
  sourceTableId: string;
  targetTableId: string;
  message: string;
  orderTotal?: number;
  sourceTable?: TableData;
  targetTable?: TableData;
}

// ── Bookings ──────────────────────────────────────────────────────────────────
export type BookingStatus = 'upcoming' | 'seated' | 'cancelled';

export interface Booking {
  id: string;
  tableId: string;
  guestName: string;
  phone: string;
  notes: string;
  partySize: number;
  date: string;
  time: string;
  status: BookingStatus;
  zonePreference?: string;
  reminderEnabled?: boolean;
  createdAt: string;
}

export interface CreateBookingRequest {
  tableId: string;
  guestName: string;
  phone: string;
  notes?: string;
  partySize: number;
  date: string;
  time: string;
  zonePreference?: string;
  reminderEnabled?: boolean;
}

export interface UpdateBookingRequest extends Partial<CreateBookingRequest> {
  status?: BookingStatus;
}

// ── Stock ─────────────────────────────────────────────────────────────────────
export type StockStatus = 'ok' | 'low' | 'critical';

export interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderThreshold: number;
  maxStock?: number;
  maxCapacity?: number;
  status?: StockStatus;
  lastUpdated?: string;
  updatedBy?: string;
  costPerUnit?: number;
  sku?: string;
}

export interface UpdateStockCountRequest {
  currentStock: number;
  updatedBy?: string;
  note?: string;
}

export interface BulkStockUpdateRequest {
  updates: Array<{ id: string; currentStock: number }>;
  updatedBy?: string;
  note?: string;
}

export interface StockHistoryEntry {
  id: string;
  stockItemId: string;
  timestamp: string;
  type: 'consumed' | 'restocked' | 'adjusted' | 'reconciled';
  quantity: number;
  previousStock: number;
  newStock: number;
  updatedBy: string;
  note?: string | null;
}

export interface StockReconcileRequest {
  shiftId: string;
  reconciledBy: string;
  note?: string;
  items: Array<{ stockItemId: string; actualCount: number }>;
}

export interface StockReconcileResponse {
  reconciliationId: string;
  shiftId: string;
  reconciledBy: string;
  timestamp: string;
  totalItems: number;
  matchedItems: number;
  varianceItems: number;
  summary: Array<{
    stockItemId: string;
    name: string;
    systemCount: number;
    actualCount: number;
    variance: number;
    newStatus: StockStatus;
  }>;
}

// ── Orders ────────────────────────────────────────────────────────────────────
export type OrderItemStatus = 'Queued' | 'In Prep' | 'Ready' | 'Served' | 'Voided';

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  status: OrderItemStatus;
  notes?: string;
  size?: string;
  /** Menu catalog id — not the same as order line `id` */
  menuItemId?: string;
  categoryId?: string;
  categoryType?: MenuCategoryType;
}

export interface TableOrder {
  tableId: string;
  /** Server order id (e.g. "15") — store from GET/POST, not client-generated */
  orderId?: string;
  guestCount?: number;
  items: OrderItem[];
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
}

export interface AddOrderItemsRequest {
  items: Array<{
    menuItemId: string;
    name: string;
    qty: number;
    unitPrice: number;
    categoryId?: string;
    size?: string;
    notes?: string;
  }>;
  /** Staff user id (e.g. u2) — NOT display name */
  staff: string;
  /** Party size — required when opening/seating; send on kitchen send */
  guestCount?: number;
}

export interface CategoryPrintJobLine {
  name: string;
  qty: number;
  size?: string;
  unitPrice?: number;
  notes?: string;
}

/** Built on POST /orders/{tableId}/items from category kitchen links */
export interface KitchenPrintJob {
  printerId?: string;
  printerIp: string;
  printerPort: number;
  categoryId?: string;
  categoryLabel: string;
  lines: CategoryPrintJobLine[];
}

/** @deprecated use KitchenPrintJob */
export type CategoryPrintJob = KitchenPrintJob;

export interface AddOrderItemsResponse {
  orderId?: string;
  addedItems: OrderItem[];
  kdsTicketId: string;
  guestCount?: number;
  kitchenPrintJobs?: KitchenPrintJob[];
  /** @deprecated backend may omit; use kitchenPrintJobs */
  categoryPrintJobs?: KitchenPrintJob[];
}

export interface VoidOrderItemRequest {
  reason: string;
  managerApproval?: string;
}

// ── KDS ───────────────────────────────────────────────────────────────────────
export type KDSStatus = 'Queued' | 'In Prep' | 'Ready';

export interface KDSItem {
  id: string;
  name: string;
  qty: number;
  notes?: string;
  priority?: boolean;
}

export interface KDSTicket {
  id: string;
  tableLabel: string;
  zone: string;
  status: KDSStatus;
  items: KDSItem[];
  /** Elapsed minutes since ticket was queued (normalized for display) */
  queuedAt: number;
  staff: string;
  priority?: boolean;
  createdAt?: string;
  elapsedMinutes?: number;
}

// ── Menu ──────────────────────────────────────────────────────────────────────
export interface MenuItemSize {
  label: string;
  price: number;
}

export interface ApiMenuItem {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  image?: string;
  description?: string;
  sizes: MenuItemSize[];
  popular?: boolean;
  available?: boolean;
}

export type MenuCategoryType = 'food' | 'drink';

export interface MenuCategory {
  id: string;
  label: string;
  icon: string;
  sortOrder?: number;
  isActive?: boolean;
  categoryType: MenuCategoryType;
}

export interface CreateMenuCategoryRequest {
  id?: string;
  label: string;
  /** Required on POST */
  categoryType: MenuCategoryType;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateMenuCategoryRequest = Partial<Omit<CreateMenuCategoryRequest, 'categoryType'>> & {
  categoryType?: MenuCategoryType;
};

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  category: string;
  description?: string;
  popular?: boolean;
  image?: string;
  sizes?: MenuItemSize[];
  available?: boolean;
}

// ── Payments ──────────────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'card' | 'qr' | 'room';

export interface ProcessPaymentRequest {
  tableId: string;
  guestCount?: number;
  method: PaymentMethod;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  /** Line-item sales subtotals by category type (excludes SC/VAT) — optional, for reports */
  foodSubtotal?: number;
  drinkSubtotal?: number;
  cashTendered?: number | null;
  roomNumber?: string | null;
  discount?: number;
  /** User id of staff processing payment (e.g. u2) — required for reports */
  staffId?: string;
  cashierId?: string;
}

export interface ProcessPaymentResponse {
  paymentId: string;
  tableId: string;
  method: PaymentMethod;
  total: number;
  change: number;
  receiptUrl: string;
  /** Server ESC/POS to receipt printer succeeded */
  receiptPrinted?: boolean;
  /** When receiptPrinted is false — TCP/IP/port message; not a layout hint */
  receiptPrintMessage?: string;
  /** @deprecated prefer closedAt — kept for legacy rows */
  timestamp: string;
  openedAt?: string;
  closedAt?: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  tableLabel?: string;
  zoneLabel?: string;
  discount?: number;
  subtotal?: number;
  serviceCharge?: number;
  vat?: number;
  cashTendered?: number | null;
  changeAmount?: number;
  roomNumber?: string | null;
}

/** GET /api/receipts/{paymentId} — payment fields plus line items for preview. */
export interface ReceiptResponse extends ProcessPaymentResponse {
  items?: OrderItem[];
}

export interface SplitPaymentLine {
  guestLabel: string;
  /** Required — each split must include at least one order line id */
  itemIds: string[];
  method: PaymentMethod;
  /** Final charge (backend stores service/VAT as 0 on splits; amount is treated as final) */
  amount: number;
  cashTendered?: number | null;
  roomNumber?: string | null;
  discount?: number;
}

export interface SplitPaymentRequest {
  tableId: string;
  guestCount?: number;
  staffId?: string;
  cashierId?: string;
  splits: SplitPaymentLine[];
}

export interface SplitPaymentResponse {
  orderId?: string;
  splitEventId?: string;
  splitPayments: Array<{
    paymentId: string;
    guestLabel: string;
    amount: number;
    method: PaymentMethod;
    closedAt?: string;
  }>;
}

// ── Shift / Cash ──────────────────────────────────────────────────────────────
export interface ShiftSummary {
  shiftId: string;
  openedAt: string;
  cashier: string;
  terminal?: string;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  qrSales: number;
  roomChargeSales: number;
  voids: number;
  discounts: number;
  covers: number;
  transactions?: number;
}

export interface OpenShiftRequest {
  cashierId: string;
  openingFloat: number;
  terminalId: string;
}

export interface CloseShiftRequest {
  countedCash: number;
  notes?: string;
}

export interface CloseShiftResponse {
  shiftId: string;
  closedAt: string;
  totalRevenue: number;
  cashVariance: number;
  reportUrl: string;
}

export interface HourlyRevenue {
  hour: string;
  cash?: number;
  card?: number;
  qr?: number;
  vip?: number;
  bar?: number;
  terrace?: number;
  cabana?: number;
  revenue?: number;
  orders?: number;
}

export interface RecentTransaction {
  id: string;
  tableId?: string;
  tableLabel: string;
  amount: number;
  method: 'Cash' | 'Card' | 'QR' | 'Room';
  time: string;
  staff: string;
  items?: number;
  covers?: number;
  type?: string;
}

export interface DrawerReconcileRequest {
  shiftId: string;
  denominations: Record<string, number>;
  countedTotal: number;
}

export interface DrawerReconcileResponse {
  expectedCash: number;
  countedCash: number;
  variance: number;
  status: 'balanced' | 'short' | 'over';
}

export interface DrawerCount {
  denomination: string;
  value: number;
  count: number;
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────
export interface ZoneRevenue {
  zone: string;
  revenue: number;
  guests: number;
  tables: number;
  color: string;
}

export interface TopItem {
  name: string;
  category: string;
  qty: number;
  revenue: number;
  trend?: 'up' | 'down';
}

export interface PaymentBreakdown {
  name: string;
  value: number;
  color?: string;
}

export interface HourlyZoneRevenue {
  hour: string;
  vip: number;
  bar: number;
  terrace: number;
  cabana: number;
}

export interface DashboardKpiSummary {
  shiftRevenue: number;
  totalGuests: number;
  avgSpend: number;
  activeTables: number;
  tablesAwaitingBill: number;
  lastUpdated: string;
}

export interface DashboardSummary {
  zoneRevenue?: ZoneRevenue[];
  topItems?: TopItem[];
  paymentBreakdown?: PaymentBreakdown[];
  hourlyData?: HourlyZoneRevenue[];
  activeTables?: number;
  awaitingBill?: number;
}

// ── Roster ────────────────────────────────────────────────────────────────────
export type ShiftType = 'Morning' | 'Afternoon' | 'Evening' | 'Night';
export type AvailabilityStatus = 'available' | 'unavailable' | 'partial';

export interface StaffShift {
  id: string;
  staffId: string;
  staffName: string;
  staffAvatar?: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  shiftType: ShiftType;
  kdsAssigned: boolean;
  notes?: string;
}

export interface CreateShiftRequest {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  shiftType: ShiftType;
  kdsAssigned?: boolean;
  notes?: string;
}

export interface StaffAvailability {
  staffId: string;
  staffName: string;
  role: string;
  preferredZone?: string;
  kdsStation?: string;
  weeklyAvailability: Record<string, AvailabilityStatus>;
}

export interface KdsAssignment {
  staffId: string;
  staffName: string;
  kdsStation: string;
  zone: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export type AnalyticsRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface AnalyticsHourlyRevenue {
  hour: string;
  revenue: number;
  orders: number;
}

export interface AnalyticsTopItem {
  name: string;
  menuItemId: string;
  category: string;
  qty: number;
  revenue: number;
}

export interface AnalyticsTableTurnover {
  zone: string;
  avgMinutes: number;
  turns: number;
  revenue: number;
}

export interface AnalyticsStaffPerformance {
  staffId: string;
  name: string;
  role: UserRole;
  orders: number;
  revenue: number;
  avgOrderValue: number;
  covers: number;
}

export interface AnalyticsTransaction {
  id: string;
  paymentId?: string;
  orderId?: string;
  tableId: string;
  tableLabel: string;
  amount: number;
  method: 'Cash' | 'Card' | 'QR' | 'Room' | string;
  /** Close / pay time — same as closedAt when backend sends it */
  time: string;
  openedAt?: string;
  closedAt?: string;
  staffId: string;
  staffName: string;
  items?: number;
  foodSubtotal?: number;
  drinkSubtotal?: number;
}

export interface AnalyticsTransactionSplitPart {
  guestLabel: string;
  method: string;
  amount: number;
  itemIds?: string[];
  paymentId?: string;
}

export interface AnalyticsTransactionMergeInfo {
  sourceTableId: string;
  sourceTableLabel: string;
  targetTableId: string;
  targetTableLabel: string;
  mergedAt: string;
  mergedByStaffId?: string;
  mergedByName?: string;
}

/** One table merge event on the order (order detail + payment detail). */
export interface OrderMergeRecord {
  sourceTableId?: string;
  sourceTableLabel?: string;
  targetTableId?: string;
  targetTableLabel?: string;
  mergedAt?: string;
  time?: string;
  itemsMoved?: number;
  itemCount?: number;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  mergedByStaffId?: string;
  mergedByName?: string;
}

/** One split-bill session on the order (may include multiple payment ids). */
export interface OrderSplitSession {
  splitCount?: number;
  count?: number;
  total?: number;
  paymentIds?: string[];
  splitAt?: string;
  time?: string;
  closedAt?: string;
}

/** Table transfer event on the order (from `table_transfer_events`). */
export interface OrderTransferRecord {
  sourceTableId?: string;
  sourceTableLabel?: string;
  targetTableId?: string;
  targetTableLabel?: string;
  transferredAt?: string;
  time?: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  guests?: number;
}

/** Full payment/order detail — analytics transaction + orders/details + legacy payments */
export interface AnalyticsTransactionDetail {
  paymentId: string;
  orderId?: string;
  tableSessionId?: string;
  shiftId?: string;
  tableId: string;
  tableLabel: string;
  zoneId?: string;
  zoneLabel?: string;
  type?: string;
  method: string;
  amount: number;
  total?: number;
  subtotal?: number;
  serviceCharge?: number;
  vat?: number;
  discount?: number;
  /** Party size — prefer guestCount from API */
  guestCount?: number;
  covers?: number;
  openedAt?: string;
  closedAt?: string;
  durationMinutes?: number;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  /** Server / staff who opened the table check */
  openedByStaffId?: string;
  openedByStaffName?: string;
  openedByStaffRole?: string;
  cashierId?: string;
  cashierName?: string;
  roomNumber?: string | null;
  cashTendered?: number | null;
  changeAmount?: number;
  legacyPayment?: boolean;
  time?: string;
  split?: AnalyticsTransactionSplitPart[] | null;
  merge?: AnalyticsTransactionMergeInfo | null;
  hasMerge?: boolean;
  hasSplit?: boolean;
  hasTransfer?: boolean;
  merges?: OrderMergeRecord[];
  splits?: OrderSplitSession[];
  transfers?: OrderTransferRecord[];
  items?: OrderItem[];
  /** Persisted at pay time — preferred for food/drink report when line items lack menu ids */
  foodSubtotal?: number;
  drinkSubtotal?: number;
  payments?: OrderDetailsPayment[];
  receiptUrl?: string;
}

export interface OrderDetailsPayment {
  paymentId: string;
  guestLabel?: string;
  method: string;
  amount: number;
  /** Display time — prefers closedAt */
  time: string;
  paidAt?: string;
  closedAt?: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
}

export interface OrderDetailsResponse {
  orderId?: string;
  tableId: string;
  tableLabel?: string;
  zoneLabel?: string;
  status?: string;
  covers?: number;
  openedAt?: string;
  closedAt?: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  paymentId?: string;
  method?: string;
  roomNumber?: string | null;
  cashTendered?: number | null;
  changeAmount?: number;
  legacyPayment?: boolean;
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  discount?: number;
  items: OrderItem[];
  payments?: OrderDetailsPayment[];
  merge?: AnalyticsTransactionMergeInfo | null;
  split?: AnalyticsTransactionSplitPart[] | null;
  hasMerge?: boolean;
  hasSplit?: boolean;
  hasTransfer?: boolean;
  merges?: OrderMergeRecord[];
  splits?: OrderSplitSession[];
  transfers?: OrderTransferRecord[];
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalCovers: number;
  hourlyRevenue: AnalyticsHourlyRevenue[];
  topItems: AnalyticsTopItem[];
  tableTurnover: AnalyticsTableTurnover[];
  staffPerformance: AnalyticsStaffPerformance[];
}

export interface AnalyticsQueryParams {
  range?: AnalyticsRange;
  from?: string;
  to?: string;
  limit?: number;
  staffId?: string;
}

// ── Staff PIN ─────────────────────────────────────────────────────────────────
export interface SetPinRequest {
  pin: string;
}

export interface VerifyPinRequest {
  pin: string;
}

export interface PinVerifyResponse {
  success?: boolean;
  valid?: boolean;
  staffId?: string;
  name?: string;
  role?: UserRole;
  message?: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotificationType = 'stock' | 'order' | 'booking' | 'system';
export type NotificationPriority = 'critical' | 'warning' | 'info' | 'success' | 'high';

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp?: string;
  createdAt?: string;
  read: boolean;
  meta?: string;
}

export interface UnreadCountResponse {
  total: number;
  stock: number;
  order: number;
  booking: number;
  system: number;
}

// ── Admin Config ──────────────────────────────────────────────────────────────
export interface VenueConfig {
  serviceCharge: number | string;
  vatRate: number | string;
  currency: string;
  currencySymbol: string;
  printerIp: string;
  printerPort: number | string;
  houseRules: string;
  receiptHeader: string;
  receiptFooter: string;
}

export interface PrinterTestResponse {
  connected: boolean;
  message: string;
  printerIp?: string;
  printerPort?: number;
  printerId?: string;
  /** Round-trip ms when backend measures a real TCP connect */
  latencyMs?: number;
}
