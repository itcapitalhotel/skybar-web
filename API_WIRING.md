# SkyBar POS — Frontend API Wiring Guide

> **Browser API URL:** `http://<ip>:4028/api` (same origin — proxied to Spring Boot, **no CORS**)  
> **Proxy target (Mac):** `http://127.0.0.1:8080` via `API_PROXY_TARGET` in `.env`  
> **Phone frontend:** `http://172.19.13.248:4028`

This document maps every frontend file to the API endpoints it calls. All paths match `BACKEND_API.md` (Spring Boot spec).

---

## API Client (`src/lib/api/`)

| File | Purpose |
|------|---------|
| `config.ts` | Base URL, JWT token + user storage |
| `types.ts` | TypeScript interfaces matching backend JSON |
| `client.ts` | All API modules (`authApi`, `tablesApi`, `ordersApi`, …) |
| `mappers.ts` | Menu/zone response mappers |
| `hooks.ts` | Generic `useApi` / `useMutation` hooks |

---

## File → API Mapping

### Authentication & Login

| File | APIs Used |
|------|-----------|
| `src/app/login/page.tsx` | `GET /staff`, `POST /staff/{id}/pin/verify`, `POST /auth/login` |
| `src/components/LockModal.tsx` | `POST /staff/{id}/pin/verify` |
| `src/components/ManagerPinModal.tsx` | `POST /auth/manager-pin/verify` |

### Floor Map & Orders

| File | APIs Used |
|------|-----------|
| `src/app/components/FloorMapClient.tsx` | `GET /tables`, `GET /zones`, `GET /orders/{tableId}`, `PATCH /tables/{id}/status`, `POST /orders/{tableId}/items`, `PATCH /orders/{tableId}/items/{id}/void`, `POST /tables/transfer`, `DELETE /orders/{tableId}` |
| `src/app/components/FloorCanvas.tsx` | `GET /zones` |
| `src/app/components/MenuOverlay.tsx` | `GET /menu`, `GET /menu/categories`, `POST /orders/{tableId}/items` (via parent) |
| `src/app/components/NewTableDrawer.tsx` | `POST /tables` |
| `src/components/MergeTablesModal.tsx` | `POST /tables/merge` (pairwise: `sourceTableId` → `targetTableId`, loop per secondary) |
| `src/components/TransferTableModal.tsx` | `POST /tables/transfer` — `{ sourceTableId, targetTableId, staffId }` (floor map **Change table**) |
| `src/components/PaymentModal.tsx` | `POST /payments` |
| `src/components/SplitBillModal.tsx` | `POST /payments/split` (each split: `guestLabel`, disjoint `itemIds`, `method`, `amount`, `staffId`) |

### Bookings

| File | APIs Used |
|------|-----------|
| `src/app/table-bookings/page.tsx` | `GET /bookings`, `GET /tables`, `GET /zones`, `POST/PUT/DELETE /bookings`, `PATCH /bookings/{id}/seat`, `PATCH /bookings/{id}/cancel` |

### Shift & Cash

| File | APIs Used |
|------|-----------|
| `src/app/shift-cash-split-bill/components/ShiftCashClient.tsx` | `GET /tables`, `GET /orders/{tableId}`, split/merge modals → `POST /payments/split`, `POST /tables/merge` |
| `src/app/shift-cash-split-bill/components/shiftData.ts` | Used by **Close Shift Report** (`GET /shifts/current`, transactions, hourly revenue) |
| `src/app/shift-cash-split-bill/components/DrawerReconciliation.tsx` | Unused in nav — drawer reconcile available via shift APIs if re-wired later |
| `src/app/shift-cash-split-bill/components/ShiftRevenueChart.tsx` | Used by close-shift / shift data only |
| `src/app/close-shift-report/page.tsx` | `GET /shifts/current`, `GET /shifts/{id}/transactions`, `GET /dashboard/hourly-revenue` |

### Management Pages

| File | APIs Used |
|------|-----------|
| `src/app/zone-management/page.tsx` | Full `zonesApi` CRUD + `PATCH /zones/{id}/toggle` |
| `src/app/user-management/page.tsx` | Full `usersApi` CRUD + `PATCH /users/{id}/status` |
| `src/app/staff-management/page.tsx` | `usersApi` / `staffApi` + PIN endpoints |
| `src/app/admin-config/page.tsx` | Receipt: `GET/PUT /config`, zone receipt printers CRUD; Receipt Layout preview via `ReceiptPreview` + `GET /receipts/{paymentId}` — see `docs/FRONTEND_RECEIPT_PREVIEW.md`. Category Printer: see `docs/FRONTEND_CATEGORY_PRINTERS.md` |
| `src/app/stock-management/page.tsx` | `GET /stock`, `PATCH /stock/{id}/count`, `POST /stock/bulk-update`, `GET /stock/{id}/history`, `POST /stock/reconcile` |
| `src/app/notifications/page.tsx` | Full `notificationsApi` |
| `src/app/manager-dashboard/page.tsx` | `GET /dashboard/*` (via `dashboardApi.full()`) |
| `src/app/analytics/page.tsx` | `GET /analytics/summary` |
| `src/app/weekly-roster/page.tsx` | `GET /roster/shifts`, `GET /roster/availability`, `GET /zones` |

### Real-Time (WebSocket)

| File | Topic |
|------|-------|
| `src/app/components/FloorMapClient.tsx` | `WS /ws/pos` → `/topic/tables/status` |
| `src/components/BookingReminderToast.tsx` | `/topic/bookings/reminders` |
| `src/components/OrderNotificationToast.tsx` | `/topic/orders/new` (local + WS) |

---

## Removed Static Data

These files previously had mock arrays — now API-only:

- `src/app/components/floorData.ts` — **types + utilities only** (no mock tables/orders/menu)
- `src/app/order-entry-kds/components/kdsData.ts` — API wrappers only
- `src/app/shift-cash-split-bill/components/shiftData.ts` — API wrappers + `EMPTY_SHIFT` default

---

## Spring Boot Checklist (`com.posapi`)

When building the backend, follow `BACKEND_API.md` §10–§15 for package layout and §11 for the full endpoint matrix.

Implement in this order:

1. `GET /staff`, `POST /staff/{id}/pin/verify`, `POST /auth/login` — extend `AuthController`, `StaffController`
2. `GET /zones`, `GET /tables`, `GET /menu`, `GET /menu/categories`
3. `GET /orders/{tableId}`, `POST /orders/{tableId}/items`, `POST /payments`
4. `GET /kds/tickets`, `PATCH /kds/tickets/{id}/advance`
5. `GET /shifts/current`, `GET /bookings`, `GET /notifications`
6. Dashboard, analytics, roster, stock modules

Update existing `CorsGlobalConfig.java` / `application.yml`:
- `server.address: 0.0.0.0` so API is reachable from phone
- CORS: `http://172.19.13.248:4028` + pattern `http://*:4028`

Restart Next.js after `.env` / `next.config.mjs` changes. Run `npm run dev` (binds `0.0.0.0:4028`).

**How it works:** Phone calls `http://172.19.13.248:4028/api/staff` → Next.js on Mac proxies to `http://127.0.0.1:8080/api/staff`. Same origin = no CORS preflight.

**Quick test from phone:**
- Via proxy: `http://172.19.13.248:4028/api/health` → should work after Next restart
- Direct API: `http://172.19.13.248:8080/api/health` → `{"status":"UP"}`
