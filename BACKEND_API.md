c# SkyBar POS — Spring Boot Backend API Specification

> **Purpose:** Complete backend API reference for the SkyBar POS Spring Boot server (`com.posapi`).  
> **Frontend contract:** `src/lib/api/client.ts` + `src/lib/api/types.ts` (source of truth for paths & JSON)  
> **Frontend (Mac):** `http://localhost:4028`  
> **Frontend (LAN / phone):** `http://<mac-ip>:4028` e.g. `http://172.19.13.248:4028`  
> **Backend base URL:** `http://<mac-ip>:8080/api` (bind API to `0.0.0.0:8080`)  
> **Total REST endpoints:** 113 (+ WebSocket + health)

---

## Table of Contents

1. [Quick Start (Spring Boot)](#1-quick-start-spring-boot)
2. [Environment & URLs](#2-environment--urls)
3. [Authentication & Headers](#3-authentication--headers)
4. [Error Response Format](#4-error-response-format)
5. [Role-Based Access Control](#5-role-based-access-control)
6. [Frontend Page → API Mapping](#6-frontend-page--api-mapping)
7. [Path Alignment Notes](#7-path-alignment-notes)
8. [API Modules](#8-api-modules)
   - [Auth](#81-authentication--session)
   - [Tables & Floor Map](#82-floor-map--tables)
   - [Zones](#83-zone-management)
   - [Orders](#84-orders)
   - [Menu](#85-menu-items)
   - [KDS](#86-kds--kitchen-display-system)
   - [Payments](#87-payments)
   - [Bookings](#88-table-bookings)
   - [Roster](#89-weekly-roster--staff-shifts)
   - [Users](#810-user-management)
   - [Shift & Cash](#811-shift--cash-management)
   - [Dashboard](#812-manager-dashboard)
   - [Config](#813-admin-configuration)
   - [Notifications](#814-notifications)
   - [Real-Time Events](#815-real-time-events-websocket--sse)
   - [Stock](#816-stock-management)
   - [Staff Management & PIN](#817-staff-management--pin)
   - [Analytics](#818-analytics--reporting)
9. [Suggested Database Tables](#9-suggested-database-tables)
10. [com.posapi Package Structure](#10-composapi-package-structure)
11. [Complete Endpoint Matrix](#11-complete-endpoint-matrix)
12. [Payload DTO Catalog](#12-payload-dto-catalog)
13. [Domain Entity Catalog](#13-domain-entity-catalog)
14. [Enums & Converters](#14-enums--converters)
15. [Base Classes & Existing Files](#15-base-classes--existing-files)

---

## 1. Quick Start (Spring Boot)

### Recommended dependencies (`pom.xml`)

```xml
<!-- Core -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>

<!-- JWT -->
<dependency>
  <groupId>io.jsonwebtoken</groupId>
  <artifactId>jjwt-api</artifactId>
  <version>0.12.6</version>
</dependency>

<!-- Database -->
<dependency>
  <groupId>org.postgresql</groupId>
  <artifactId>postgresql</artifactId>
</dependency>
```

### `application.properties` (minimum)

```properties
server.port=8080

spring.datasource.url=jdbc:postgresql://localhost:5432/skybarpos
spring.datasource.username=postgres
spring.datasource.password=yourpassword

# JWT
posapi.jwt.secret=your-256-bit-secret-key-change-in-production
posapi.jwt.expiration-ms=86400000

# CORS — allow localhost + LAN IPs on port 4028
posapi.cors.allowed-origins=http://localhost:4028,http://172.19.13.248:4028,http://localhost:3000,https://skybarpos2848.builtwithrocket.new
posapi.cors.allowed-origin-patterns=http://*:4028
```

### `application.yml` (CORS — recommended for LAN)

```yaml
server:
  port: 8080
  address: 0.0.0.0 # listen on all interfaces (required for phone access)

posapi:
  cors:
    allowed-origins:
      - http://localhost:4028
      - http://172.19.13.248:4028
    allowed-origin-patterns:
      - 'http://*:4028' # any host on port 4028 (survives IP changes)
    allowed-methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
    allowed-headers: '*'
    allow-credentials: true
```

### Application entry & base path

Your project uses `com.posapi.PosApiApplication` as the Spring Boot entry point.

All REST controllers extend `AbstractRestController` and map under `/api`:

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController extends AbstractRestController {
    // POST /api/auth/login  →  full URL http://localhost:8080/api/auth/login
}
```

The frontend `API_BASE_URL` is `http://localhost:8080/api`. Every path in this guide is **relative to that base** (e.g. client calls `post('/auth/login')` → `http://localhost:8080/api/auth/login`).

Health check (already exists): `GET /actuator/health` or `HealthController` at your chosen path.

---

## 2. Environment & URLs

| Environment   | Frontend URL                                | Backend URL                     | Env variable                                             |
| ------------- | ------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Mac localhost | `http://localhost:4028`                     | `http://localhost:8080/api`     | `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api`     |
| LAN / phone   | `http://172.19.13.248:4028`                 | `http://172.19.13.248:8080/api` | `NEXT_PUBLIC_API_BASE_URL=http://172.19.13.248:8080/api` |
| Production    | `https://skybarpos2848.builtwithrocket.new` | Your deployed Spring Boot URL   | Set in `.env`                                            |

**Frontend auto-detection:** When opened from a phone at `http://172.19.13.248:4028`, `getApiBaseUrl()` in `src/lib/api/config.ts` automatically calls `http://172.19.13.248:8080/api` (same hostname, port 8080). No manual `.env` change needed per device if CORS allows that origin.

### Network setup checklist

| Step | Action                                                                      |
| ---- | --------------------------------------------------------------------------- |
| 1    | Backend listens on `0.0.0.0:8080` (not `127.0.0.1` only)                    |
| 2    | CORS allows `http://172.19.13.248:4028` and/or pattern `http://*:4028`      |
| 3    | Next.js dev: `next dev -p 4028 -H 0.0.0.0` (see `package.json`)             |
| 4    | Mac and phone on same Wi‑Fi                                                 |
| 5    | Restart Next.js after `.env` changes                                        |
| 6    | Test from phone: `http://172.19.13.248:8080/api/health` → `{"status":"UP"}` |

**If Mac IP changes:** Update `NEXT_PUBLIC_API_BASE_URL` in `.env` and CORS in `application.yml`. With `http://*:4028` CORS pattern, only `.env` may need updating.

**Content-Type:** `application/json`  
**Accept:** `application/json`  
**Timestamps:** ISO 8601 (`2026-07-24T20:30:00Z`)  
**Money:** `DECIMAL(10,2)` in DB, `number` in JSON

---

## 3. Authentication & Headers

### Global request headers

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept: application/json
```

### Public endpoints (no token required)

- `POST /api/auth/login`
- `POST /api/auth/refresh`

---

## 4. Error Response Format

All errors should follow this structure:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "tableId is required",
  "timestamp": "2026-07-24T20:00:00Z",
  "path": "/api/orders/table-v1/items"
}
```

| HTTP Status | Usage                         |
| ----------- | ----------------------------- |
| 200         | Success                       |
| 201         | Resource created              |
| 400         | Validation error              |
| 401         | Missing or invalid token      |
| 403         | Insufficient role permissions |
| 404         | Resource not found            |
| 409         | Duplicate or state conflict   |
| 500         | Internal server error         |

---

## 5. Role-Based Access Control

| Role          | Permissions                                                                       |
| ------------- | --------------------------------------------------------------------------------- |
| **Admin**     | Full access — all endpoints, config, user management, zone management             |
| **Manager**   | Orders, payments, bookings, dashboard, KDS, shift management, manager PIN actions |
| **Bartender** | Orders, KDS, floor map (own tables), menu browsing                                |
| **Cashier**   | Payments, split bill, shift summary, drawer reconciliation                        |

Use `@PreAuthorize("hasRole('ADMIN')")` on Spring controllers.

---

## 6. Frontend Page → API Mapping

All pages below call real APIs via `src/lib/api/client.ts`. Implement every listed endpoint in Spring Boot.

| Frontend Page / Component     | APIs Used                                                                                                                                                                                                      | Priority |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `login/page.tsx`              | `GET /staff`, `POST /staff/{id}/pin/verify`, `POST /auth/login`                                                                                                                                                | P0       |
| `LockModal.tsx`               | `POST /staff/{id}/pin/verify`                                                                                                                                                                                  | P0       |
| `ManagerPinModal.tsx`         | `POST /auth/manager-pin/verify`                                                                                                                                                                                | P0       |
| `FloorMapClient.tsx`          | `GET /tables`, `GET /zones`, `GET /orders/{tableId}`, `PATCH /tables/{id}/status`, `POST /orders/{tableId}/items`, `PATCH …/void`, `POST /tables/transfer`, `POST /payments/split`, `DELETE /orders/{tableId}` | P0       |
| `NewTableDrawer.tsx`          | `POST /tables`                                                                                                                                                                                                 | P1       |
| `MergeTablesModal.tsx`        | `POST /tables/merge`                                                                                                                                                                                           | P1       |
| `MenuOverlay.tsx`             | `GET /menu`, `GET /menu/categories`                                                                                                                                                                            | P0       |
| `PaymentModal.tsx`            | `POST /payments`                                                                                                                                                                                               | P0       |
| `SplitBillModal.tsx`          | `POST /payments/split`                                                                                                                                                                                         | P1       |
| `order-entry-kds/*`           | `GET /kds/tickets`, `GET /tables`, `POST /orders/{tableId}/items`, `PATCH /kds/tickets/{id}/advance\|recall`, `DELETE /kds/tickets/{id}`                                                                       | P0       |
| `table-bookings/page.tsx`     | Full bookings CRUD + seat/cancel                                                                                                                                                                               | P2       |
| `stock-management/page.tsx`   | `GET /stock`, `PATCH /stock/{id}/count`, `POST /stock/bulk-update` (+ history/reconcile when built)                                                                                                            | P2       |
| `zone-management/page.tsx`    | Full zones CRUD + `PATCH /zones/{id}/toggle`                                                                                                                                                                   | P1       |
| `admin-config/page.tsx`       | `GET/PUT /config`, `GET /zones`, `POST /config/printer/test`, zone printers                                                                                                                                    | P2       |
| `user-management/page.tsx`    | Full users CRUD + `PATCH /users/{id}/status`                                                                                                                                                                   | P1       |
| `staff-management/page.tsx`   | `usersApi` CRUD (+ `staffApi` PIN when extended)                                                                                                                                                               | P1       |
| `manager-dashboard/page.tsx`  | `GET /dashboard/*` (5 endpoints)                                                                                                                                                                               | P2       |
| `analytics/page.tsx`          | `GET /analytics/summary` (+ sub-endpoints)                                                                                                                                                                     | P3       |
| `notifications/page.tsx`      | Full notifications CRUD                                                                                                                                                                                        | P2       |
| `shift-cash-split-bill/*`     | `GET /tables`, `GET /orders/{tableId}`, `POST /payments/split`, `POST /tables/merge` (UI: **Split & Merge Bill**)                                                                                              | P1       |
| `DrawerReconciliation.tsx`    | `POST /shifts/drawer/reconcile`                                                                                                                                                                                | P1       |
| `close-shift-report/page.tsx` | Shift + dashboard APIs via `shiftData.ts`                                                                                                                                                                      | P2       |
| `weekly-roster/page.tsx`      | `GET /roster/shifts`, `GET /roster/availability`, `GET /zones`                                                                                                                                                 | P3       |
| `BookingReminderToast.tsx`    | WebSocket `/topic/bookings/reminders`                                                                                                                                                                          | P3       |
| `OrderNotificationToast.tsx`  | WebSocket `/topic/orders/new`                                                                                                                                                                                  | P3       |

See also: `API_WIRING.md` for the full file-by-file breakdown.

---

## 7. Frontend Contract (Exact Paths)

The frontend `src/lib/api/client.ts` is **fully aligned** with this spec. Implement these paths exactly — no aliases needed.

| Area           | Method | Path                         | Request body (key fields)                                                                                                              |
| -------------- | ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Login          | POST   | `/auth/login`                | `{ email, password }` — login page sends staff email + 4-digit PIN as password                                                         |
| Staff PIN      | POST   | `/staff/{id}/pin/verify`     | `{ pin }`                                                                                                                              |
| Manager PIN    | POST   | `/auth/manager-pin/verify`   | `{ pin, action }`                                                                                                                      |
| Shifts         | GET    | `/shifts/current`            | —                                                                                                                                      |
| Drawer         | POST   | `/shifts/drawer/reconcile`   | `{ shiftId, denominations, countedTotal }`                                                                                             |
| Zone toggle    | PATCH  | `/zones/{id}/toggle`         | — (toggles `isActive`)                                                                                                                 |
| User status    | PATCH  | `/users/{id}/status`         | `{ status: "active" \| "inactive" }`                                                                                                   |
| Staff status   | PATCH  | `/staff/{id}/toggle-status`  | —                                                                                                                                      |
| Menu           | GET    | `/menu` + `/menu/categories` | categories returns `string[]`                                                                                                          |
| Add order      | POST   | `/orders/{tableId}/items`    | `{ items[], staff }`                                                                                                                   |
| Split bill     | POST   | `/payments/split`            | `{ tableId, staffId, cashierId, splits[] }` — each split needs **`guestLabel`**, **`itemIds`** (non-empty), **`method`**, **`amount`** |
| Table merge    | POST   | `/tables/merge`              | `{ sourceTableId, targetTableId }` — **one pair per call**; multi-table UI loops secondary → primary                                   |
| Table transfer | POST   | `/tables/transfer`           | `{ sourceTableId, targetTableId, itemIds?, staffId }` — `itemIds` null/[] = whole check                                                |
| Config printer | POST   | `/config/printer/test`       | `{ printerIp, printerPort }`                                                                                                           |
| Notifications  | PATCH  | `/notifications/read-all`    | —                                                                                                                                      |
| Notifications  | DELETE | `/notifications/clear-read`  | —                                                                                                                                      |

**Login flow:** `GET /staff` → user picks staff → `POST /staff/{id}/pin/verify` → on success `POST /auth/login` with `{ email, password: pin }` → store JWT from response.

### 7.1 Transfer, merge, split — front-end vs backend (today)

| Feature           | Front-end (`skybarpos`)                                                                                                               | Backend must implement                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pay full bill** | `POST /api/payments` + totals + `staffId`                                                                                             | Returns `openedAt`, `closedAt`; closes table                                                                                                                         |
| **Split**         | `POST /api/payments/split` — **disjoint `itemIds` per split** (helper partitions lines for Equal / By $); By item = manual assignment | Each split: **`guestLabel`**, **`itemIds[]` (≥1)**, **`method`**, **`amount`** (final $; SC/VAT often 0 on split rows). Optional `staffId` / `cashierId` on request. |
| **Merge**         | `MergeTablesModal` calls merge **once per** secondary table: `{ sourceTableId, targetTableId }`                                       | **Not** `primaryTableId` + `secondaryTableIds[]` unless you add it. No `mergedWith[]` on `GET /tables` yet.                                                          |
| **Transfer**      | `POST /api/tables/transfer` — whole check or partial `itemIds[]` + `staffId`                                                          | Move order (or lines) to **empty** target; source freed or reduced; **400** if target has active order                                                               |

---

## 8. API Modules

> Full URL = `http://localhost:8080` + path below (paths already include `/api` prefix).

---

### 8.1 Authentication & Session

#### `POST /api/auth/login`

Staff login. Returns JWT and user profile.

**Auth:** None

**Request:**

```json
{
  "email": "alex@skybar.com",
  "password": "1234"
}
```

> Login page flow: staff list from `GET /staff` → PIN verify via `POST /staff/{id}/pin/verify` → then `POST /auth/login` with `{ email: staff.email, password: pin }`. Accept 4-digit PIN as password for staff login.

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "string",
  "user": {
    "id": "u1",
    "name": "Alex Miller",
    "email": "alex@skybar.com",
    "role": "Admin",
    "terminalId": "POS-01",
    "avatar": "AM"
  }
}
```

#### `POST /api/auth/logout`

Invalidate current session token.

**Auth:** Bearer Token

**Response:**

```json
{ "message": "Logged out successfully" }
```

#### `POST /api/auth/refresh`

Refresh JWT using refresh token.

**Auth:** None

**Request:**

```json
{ "refreshToken": "string" }
```

**Response:**

```json
{ "token": "string", "refreshToken": "string" }
```

#### `POST /api/auth/manager-pin/verify`

Verify manager PIN for privileged actions (void, discount, edit mode).

**Auth:** Bearer Token

**Request:**

```json
{ "pin": "1234", "action": "VOID_ITEM" }
```

**Response:**

```json
{ "approved": true, "approvedBy": "Casey Wong", "role": "Manager" }
```

#### `GET /api/auth/me`

Get current authenticated user profile.

**Auth:** Bearer Token

**Response:**

```json
{
  "id": "u1",
  "name": "Alex Miller",
  "role": "Admin",
  "terminalId": "POS-01",
  "status": "on_shift"
}
```

---

### 8.2 Floor Map & Tables

#### `GET /api/tables`

Get all tables. Optional query: `?zone=vip`

**Response:**

```json
[
  {
    "id": "table-v1",
    "label": "V1",
    "zone": "vip",
    "status": "occupied",
    "guests": 6,
    "capacity": 8,
    "staff": "Alex",
    "seatedMinutes": 102,
    "minSpend": 500,
    "orderTotal": 387,
    "shape": "rect",
    "x": 60,
    "y": 80
  }
]
```

#### `GET /api/tables/{tableId}`

Get single table by ID. Same object shape as above.

#### `POST /api/tables`

Create a new table. **Auth:** Admin/Manager

**Request:**

```json
{
  "label": "V7",
  "zone": "vip",
  "capacity": 6,
  "shape": "circle",
  "x": 500,
  "y": 300,
  "minSpend": 500
}
```

**Response:**

```json
{
  "id": "table-v7",
  "label": "V7",
  "zone": "vip",
  "status": "available",
  "capacity": 6,
  "shape": "circle",
  "x": 500,
  "y": 300
}
```

#### `PUT /api/tables/{tableId}`

Update table properties. **Auth:** Admin/Manager

**Request:**

```json
{
  "label": "V7",
  "capacity": 8,
  "minSpend": 600,
  "shape": "rect"
}
```

#### `DELETE /api/tables/{tableId}`

Delete table. **Auth:** Admin

**Response:** `{ "message": "Table deleted" }`

#### `PATCH /api/tables/{tableId}/status`

Update table status.

**Request:**

```json
{
  "status": "occupied",
  "guests": 4,
  "staff": "Jordan"
}
```

> `status` values: `available` | `occupied` | `reserved` | `bill`

#### `PATCH /api/tables/{tableId}/position`

Save canvas position after drag. **Auth:** Admin/Manager

**Request:** `{ "x": 120, "y": 200 }`

#### `POST /api/tables/merge`

Merge tables — combine orders into one bill. **Auth:** Manager+

**Implemented contract (pairwise only):**

```json
{
  "sourceTableId": "table-v2",
  "targetTableId": "table-v1"
}
```

> **Front-end:** `MergeTablesModal` picks a **primary** table, then calls merge once per **secondary** with `sourceTableId` = secondary, `targetTableId` = primary.  
> **Not supported today:** `{ "primaryTableId", "secondaryTableIds": [] }` in one request.  
> **Future:** persist merge group (`mergedWith[]` on `GET /tables`), `mergedFrom` on order detail, WebSocket refresh, combined guest counts + earliest `seatedAt`.

**Response:**

```json
{
  "mergedTableId": "table-v1",
  "message": "Tables merged successfully",
  "combinedOrderTotal": 601
}
```

#### `POST /api/tables/transfer`

Move the **open check** to another table (floor map **Change table**). **Auth:** JWT (Bartender: manager PIN on front-end).

**Request:**

```json
{
  "sourceTableId": "table-v1",
  "targetTableId": "table-v5",
  "staffId": "user-123"
}
```

- Source must have an **active** order.
- Target must be **empty** (no active order) — else **400**; use **`POST /api/tables/merge`** if both tables need one bill.
- Updates order `tableId`, KDS ticket labels, both table statuses/guests/staff.
- Persists **`table_transfer_events`** for reporting.

Order detail includes **`transfers[]`**, **`hasTransfer`**, alongside merge/split flags.

**Response (minimum):**

```json
{
  "sourceTableId": "table-v2",
  "targetTableId": "table-v5",
  "message": "Order transferred",
  "orderTotal": 452.79
}
```

**Response (recommended for UI):** include updated `sourceTable` + `targetTable` (`TableResponse`) or `{ sourceTable, targetTable, order }`.

---

### 8.3 Zone Management

#### `GET /api/zones`

**Response:**

```json
[
  {
    "id": "vip",
    "label": "VIP Edge Skyline",
    "description": "Premium rooftop section with city views",
    "color": "#f59e0b",
    "tableCount": 6,
    "capacity": 46,
    "isActive": true,
    "canvasWidth": 900,
    "canvasHeight": 600
  }
]
```

#### `POST /api/zones` — **Auth:** Admin

**Request:**

```json
{
  "label": "Rooftop Bar",
  "description": "New outdoor section",
  "color": "#3b82f6",
  "canvasWidth": 900,
  "canvasHeight": 600
}
```

#### `PUT /api/zones/{zoneId}` — **Auth:** Admin

#### `DELETE /api/zones/{zoneId}` — **Auth:** Admin (only if no active tables)

#### `PATCH /api/zones/{zoneId}/toggle` — **Auth:** Admin

**Response:** `{ "id": "vip", "isActive": false }`

#### `GET /api/zones/{zoneId}/printers` — **Auth:** Admin

**Response:**

```json
[
  {
    "id": "zp-001",
    "zoneId": "vip",
    "name": "VIP Bar Printer",
    "printerIp": "192.168.1.101",
    "printerPort": 9100,
    "isDefault": true
  }
]
```

#### `POST /api/zones/{zoneId}/printers` — **Auth:** Admin

**Request:**

```json
{
  "name": "VIP Bar Printer",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "isDefault": false
}
```

#### `PUT /api/zones/{zoneId}/printers/{printerId}` — **Auth:** Admin

**Request** (`UpdateZonePrinterRequest` — partial):

```json
{
  "name": "VIP Bar Printer",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "isDefault": true
}
```

> Setting **`isDefault`: true** clears default on other printers in the same zone.

**Response:** `ZonePrinterResponse` (same shape as POST).

#### `DELETE /api/zones/{zoneId}/printers/{printerId}` — **Auth:** Admin

#### `POST /api/zones/{zoneId}/printers/{printerId}/test` — **Auth:** Admin

Tests the **saved** printer row (IP/port on `zone_printers`) — same TCP semantics as **`POST /api/config/printer/test`**.

> **Front-end (today):** Zone **Test ×5** uses **`POST /api/config/printer/test`** with the IP/port from the form (after `PUT` save), not this route, until zone test performs a real socket check.

**Response:** `PrinterTestResponse` plus optional `printerId`, `printerIp`, `printerPort`.

#### Category kitchen printers (food/drink tickets — **not** receipt `zone_printers`)

Receipt printers stay on **`/zones/{zoneId}/printers`**. Category tickets use **`kitchen_stations`** + **`menu_category_kitchen_stations`**. **No zone** in category printer URLs or admin UI.

**Front-end spec:** [`docs/FRONTEND_CATEGORY_PRINTERS.md`](docs/FRONTEND_CATEGORY_PRINTERS.md)

#### `GET /api/kitchen-printers` — **Auth:** Admin

All kitchen stations (optional picker when editing a category). Fields: `id`, `name`, `printerIp`, `printerPort` — no zone.

#### `GET /api/menu/categories/{categoryId}/printers` — **Auth:** Admin

**Response:**

```json
{
  "categoryId": "cocktails",
  "printers": [
    {
      "id": "ks-001",
      "name": "Bar",
      "printerIp": "192.168.1.50",
      "printerPort": 9100
    }
  ]
}
```

#### `PUT /api/menu/categories/{categoryId}/printers` — **Auth:** Admin

**Request:** full replace for that category.

```json
{
  "printers": [
    { "id": "ks-001", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 },
    { "name": "Grill", "printerIp": "192.168.1.51", "printerPort": 9100 }
  ]
}
```

Include **`id`** on existing rows; omit **`id`** for new printers.

**Front-end:** Admin Config → **Category Printer** — name / IP / port rows per category, one Save → one PUT.

**Runtime:** `POST /orders/{tableId}/items` returns **`kitchenPrintJobs`**; WebSocket **`/topic/print/kitchen`**. Not `receiptPrinter`.

---

### 8.4 Orders

#### `GET /api/orders`

Get active orders. Query: `?tableId=` or `?status=`

#### `GET /api/orders/{tableId}`

**Response:**

```json
{
  "tableId": "table-v1",
  "items": [
    {
      "id": "item-001",
      "name": "Don Julio 1942",
      "qty": 2,
      "unitPrice": 48,
      "status": "Served",
      "notes": "On the rocks",
      "size": "Shot"
    }
  ],
  "subtotal": 96,
  "serviceCharge": 9.6,
  "vat": 6.72,
  "total": 112.32
}
```

#### `POST /api/orders/{tableId}/items`

Add items to table order. Creates KDS ticket.

**Request:**

```json
{
  "items": [
    {
      "menuItemId": "menu-s1",
      "name": "Don Julio 1942",
      "qty": 1,
      "unitPrice": 48,
      "size": "Shot",
      "notes": "On the rocks"
    }
  ],
  "staff": "Alex"
}
```

**Response:**

```json
{
  "addedItems": [
    {
      "id": "item-001",
      "name": "Don Julio 1942",
      "qty": 1,
      "unitPrice": 48,
      "status": "Queued"
    }
  ],
  "kdsTicketId": "kds-001",
  "kitchenPrintJobs": [
    {
      "printerIp": "192.168.1.50",
      "printerPort": 9100,
      "categoryLabel": "Cocktails",
      "lines": [
        { "name": "Signature Sunset", "qty": 1, "size": "Single", "unitPrice": 22 }
      ]
    }
  ]
}
```

**Kitchen print jobs:** built from category-linked stations (`menu_category_kitchen_stations`). If nothing is configured, `kitchenPrintJobs` is `[]`. Broadcast on WebSocket **`/topic/print/kitchen`**. Kitchen TCP print is via print agent / future server — not receipt printer.

#### `PATCH /api/orders/{tableId}/items/{itemId}/void`

Void item. Requires manager PIN. **Auth:** Manager PIN

**Request:**

```json
{
  "reason": "Customer changed mind",
  "managerApproval": "pin-token-xyz"
}
```

#### `DELETE /api/orders/{tableId}`

Clear order after payment.

---

### 8.5 Menu Items

#### `GET /api/menu`

Full menu with categories and items.

**Response:**

```json
[
  {
    "id": "menu-c1",
    "name": "Signature Sunset",
    "category": "Cocktails",
    "image": "https://...",
    "description": "Passionfruit, mango, prosecco, edible gold dust",
    "sizes": [
      { "label": "Single", "price": 22 },
      { "label": "Double", "price": 38 }
    ],
    "popular": true,
    "available": true
  }
]
```

#### `GET /api/menu/categories`

**Response:** `["Cocktails", "Spirits", "Wine & Bubbles", "Beer", "Bites", "Hookah"]`

#### `POST /api/menu` — **Auth:** Admin/Manager

#### `PUT /api/menu/{menuItemId}` — **Auth:** Admin/Manager

#### `DELETE /api/menu/{menuItemId}` — **Auth:** Admin

#### `PATCH /api/menu/{menuItemId}/availability` — **Auth:** Admin/Manager

**Request:** `{ "available": false }`

---

### 8.6 KDS — Kitchen Display System

#### `GET /api/kds/tickets`

Query: `?status=Queued|In Prep|Ready`

**Response:**

```json
[
  {
    "id": "kds-001",
    "tableLabel": "V1",
    "zone": "VIP",
    "status": "In Prep",
    "queuedAt": 8,
    "staff": "Alex",
    "items": [{ "id": "ki-001", "name": "Don Julio 1942", "qty": 2 }]
  }
]
```

#### `PATCH /api/kds/tickets/{ticketId}/advance`

Advance: Queued → In Prep → Ready → Served

#### `PATCH /api/kds/tickets/{ticketId}/recall`

Recall to previous status.

#### `DELETE /api/kds/tickets/{ticketId}`

Remove ticket after served.

---

### 8.7 Payments

#### `POST /api/payments`

Process payment. Clears order and updates table status.

**Request:**

```json
{
  "tableId": "table-v1",
  "method": "card",
  "subtotal": 387.0,
  "serviceCharge": 38.7,
  "vat": 27.09,
  "total": 452.79,
  "cashTendered": null,
  "roomNumber": null,
  "discount": 0
}
```

> `method` values: `cash` | `card` | `qr` | `room`

**Response:**

```json
{
  "paymentId": "pay-001",
  "tableId": "table-v1",
  "method": "card",
  "total": 452.79,
  "change": 0,
  "receiptUrl": "/api/receipts/pay-001",
  "receiptPrinted": true,
  "receiptPrintMessage": null,
  "timestamp": "2026-07-24T20:30:00Z",
  "openedAt": "2026-07-24T19:15:00Z",
  "closedAt": "2026-07-24T20:30:00Z"
}
```

> **`closedAt`** is set on payment completion (same instant as `timestamp` for new rows). **`openedAt`** comes from order seat time / order creation. Legacy rows without `closed_at` in DB: API falls back to `timestamp`.

> **`receiptPrinted` / `receiptPrintMessage`:** After pay, the server sends **ESC/POS** to **`receiptPrinter`** (zone default or venue config). **`receiptPrinted: false`** means pay succeeded but TCP print failed — use **`receiptPrintMessage`** (IP/port/network), not the browser preview. ESC/POS layout mirrors the frontend preview structure (header/footer centered; items name-left/total-right; table line; totals; payment). **Front-end spec:** [`docs/FRONTEND_RECEIPT_PREVIEW.md`](docs/FRONTEND_RECEIPT_PREVIEW.md).

#### `POST /api/payments/split`

Split bill across guests. **HTTP 200** on success. **Each split line is a separate payment** — amounts are **final** (service charge / VAT often **0** on split payment rows).

**Auth:** Bearer JWT (Cashier / Manager / Admin).

**Request:**

```json
{
  "tableId": "table-v1",
  "staffId": "u1",
  "cashierId": "u1",
  "splits": [
    {
      "guestLabel": "Guest 1",
      "itemIds": ["oi-abc", "oi-def"],
      "method": "cash",
      "amount": 25.0
    },
    {
      "guestLabel": "Guest 2",
      "itemIds": ["oi-ghi"],
      "method": "card",
      "amount": 26.79
    }
  ]
}
```

**Validation (400 with clear `message`):**

| Rule | Detail |
|------|--------|
| Split count | At least **2** splits (`splits.length >= 2`) |
| Order | Active order for `tableId` only; reject if already **paid** / closed |
| Line ids | Every **non-void** `order_items.id` appears **exactly once** across all `itemIds`; reject unknown, voided, or duplicate ids |
| Amounts | Recalculate order **`total`** from venue rules, then **`sum(splits[].amount)`** within **±0.02** of that total |
| Per split | **`guestLabel`**, non-empty **`itemIds`**, **`method`**, **`amount`** required |

**Server behavior (single transaction):**

- Create multiple **`payments`** sharing **`splitGroupId`**
- Insert **`payment_splits`** and **`bill_split_events`**
- Order → **`paid`**; table → **`available`**; shift transactions as for full pay
- Do **not** create a phantom order on this path (no empty order from `getOrderByTableId()`)

**Front-end (`SplitBillModal`):** Equal / By $ **partition** `itemIds`; By item = manual assignment. Use **`GET /orders/{tableId}` → `total`** for split amounts (not a hardcoded tax multiplier).

**Response:**

```json
{
  "orderId": "ord-001",
  "splitEventId": "bse-001",
  "splitPayments": [
    { "paymentId": "pay-101", "guestLabel": "Guest 1", "amount": 25.0, "method": "cash" },
    { "paymentId": "pay-102", "guestLabel": "Guest 2", "amount": 26.79, "method": "card" }
  ]
}
```

> **Future:** optional `cashTendered`, `roomNumber`, `discount` per split; `openedAt` / `closedAt` / receipt URLs on each `splitPayments[]` entry.

#### `GET /api/receipts/{paymentId}`

Get receipt data for completed payment. Same timing fields as `ProcessPaymentResponse`: **`openedAt`**, **`closedAt`** (fallback **`timestamp`** when `closed_at` is null in DB), plus line items when available.

---

### 8.8 Table Bookings

#### `GET /api/bookings`

Query: `?date=`, `?zone=`, `?status=`

**Response:**

```json
[
  {
    "id": "bk-001",
    "tableId": "table-v3",
    "guestName": "James Thornton",
    "phone": "+1 555-0192",
    "notes": "Birthday celebration",
    "partySize": 8,
    "date": "2026-07-24",
    "time": "20:00",
    "status": "upcoming",
    "zonePreference": "vip",
    "reminderEnabled": true,
    "createdAt": "2026-07-24T14:30:00Z"
  }
]
```

#### `POST /api/bookings`

**Request:**

```json
{
  "tableId": "table-v3",
  "guestName": "James Thornton",
  "phone": "+1 555-0192",
  "notes": "Birthday celebration, champagne on arrival",
  "partySize": 8,
  "date": "2026-07-24",
  "time": "20:00",
  "zonePreference": "vip",
  "reminderEnabled": true
}
```

#### `PUT /api/bookings/{bookingId}`

#### `PATCH /api/bookings/{bookingId}/seat`

**Response:** `{ "id": "bk-001", "status": "seated" }`

#### `PATCH /api/bookings/{bookingId}/cancel`

**Response:** `{ "id": "bk-001", "status": "cancelled" }`

#### `DELETE /api/bookings/{bookingId}` — **Auth:** Admin/Manager

#### `GET /api/bookings/reminders/upcoming`

Bookings arriving within 15 minutes. **Auth:** Admin/Manager

#### `POST /api/bookings/{bookingId}/reminder/test`

Manually trigger reminder broadcast. **Auth:** Admin/Manager

---

### 8.9 Weekly Roster & Staff Shifts

#### `GET /api/roster/shifts`

Query: `?weekStart=YYYY-MM-DD`, `?staffId=`, `?zoneId=`

**Response:**

```json
[
  {
    "id": "sh-1",
    "staffId": "u1",
    "staffName": "Alex Miller",
    "staffAvatar": "AM",
    "role": "Admin",
    "date": "2026-08-03",
    "startTime": "17:00",
    "endTime": "23:00",
    "zoneId": "vip",
    "shiftType": "Evening",
    "kdsAssigned": true,
    "notes": "Opening manager"
  }
]
```

#### `POST /api/roster/shifts` — **Auth:** Admin/Manager

**Request:**

```json
{
  "staffId": "u2",
  "date": "2026-08-04",
  "startTime": "18:00",
  "endTime": "02:00",
  "zoneId": "bar",
  "shiftType": "Night",
  "kdsAssigned": true,
  "notes": "Cover for Sam"
}
```

#### `PUT /api/roster/shifts/{shiftId}` — **Auth:** Admin/Manager

#### `DELETE /api/roster/shifts/{shiftId}` — **Auth:** Admin/Manager

#### `GET /api/roster/availability` — **Auth:** Admin/Manager

#### `PUT /api/roster/availability/{staffId}` — **Auth:** Admin/Manager

**Request:**

```json
{
  "weeklyAvailability": {
    "Mon": "available",
    "Tue": "available",
    "Wed": "partial",
    "Thu": "available",
    "Fri": "available",
    "Sat": "unavailable",
    "Sun": "unavailable"
  },
  "preferredZone": "bar",
  "kdsStation": "KDS-2"
}
```

#### `GET /api/roster/kds-assignments`

#### `PATCH /api/roster/shifts/{shiftId}/kds` — **Auth:** Admin/Manager

**Request:** `{ "kdsAssigned": true }`

---

### 8.10 User Management

#### `GET /api/users` — **Auth:** Admin

#### `POST /api/users` — **Auth:** Admin

**Request:**

```json
{
  "name": "New Staff",
  "email": "staff@skybar.com",
  "role": "Bartender",
  "terminalId": "POS-05",
  "password": "initialPassword123"
}
```

#### `PUT /api/users/{userId}` — **Auth:** Admin

#### `DELETE /api/users/{userId}` — **Auth:** Admin

#### `PATCH /api/users/{userId}/status` — **Auth:** Admin

**Request:** `{ "status": "active" }`

#### `PATCH /api/users/{userId}/password` — **Auth:** Admin

**Request:** `{ "newPassword": "newSecurePassword123" }`

---

### 8.11 Shift & Cash Management

#### `GET /api/shifts/current`

**Response:**

```json
{
  "shiftId": "SH-2026-0724-01",
  "cashier": "Alex Miller",
  "openedAt": "6:00 PM",
  "openingFloat": 500,
  "cashSales": 1240,
  "cardSales": 3870,
  "qrSales": 620,
  "roomChargeSales": 480,
  "discounts": 60,
  "voids": 2,
  "covers": 78
}
```

#### `POST /api/shifts/open` — **Auth:** Admin/Manager

**Request:**

```json
{
  "cashierId": "u1",
  "openingFloat": 500,
  "terminalId": "POS-01"
}
```

#### `POST /api/shifts/close` — **Auth:** Admin/Manager

**Request:**

```json
{
  "countedCash": 1720,
  "notes": "Busy Friday night"
}
```

**Response:**

```json
{
  "shiftId": "SH-2026-0724-01",
  "closedAt": "2026-07-24T02:00:00Z",
  "totalRevenue": 6210,
  "cashVariance": -20,
  "reportUrl": "/api/shifts/SH-2026-0724-01/report"
}
```

#### `GET /api/shifts/{shiftId}/transactions`

**Response:**

```json
[
  {
    "id": "txn-001",
    "tableId": "table-v1",
    "tableLabel": "V1",
    "amount": 452.79,
    "method": "Card",
    "time": "8:32 PM",
    "staff": "Alex",
    "items": 4,
    "type": "sale"
  }
]
```

#### `POST /api/shifts/drawer/reconcile`

**Request:**

```json
{
  "shiftId": "SH-2026-0724-01",
  "denominations": {
    "100": 5,
    "50": 8,
    "20": 12,
    "10": 15,
    "5": 20,
    "1": 30,
    "coins": 4.5
  },
  "countedTotal": 1724.5
}
```

**Response:**

```json
{
  "expectedCash": 1740,
  "countedCash": 1724.5,
  "variance": -15.5,
  "status": "short"
}
```

---

### 8.12 Manager Dashboard

#### `GET /api/dashboard/summary` — **Auth:** Admin/Manager

**Response:**

```json
{
  "shiftRevenue": 8650,
  "totalGuests": 78,
  "avgSpend": 110,
  "activeTables": 12,
  "tablesAwaitingBill": 4,
  "lastUpdated": "2026-07-24T22:15:00Z"
}
```

#### `GET /api/dashboard/zone-revenue` — **Auth:** Admin/Manager

#### `GET /api/dashboard/top-items` — **Auth:** Admin/Manager

#### `GET /api/dashboard/payment-breakdown` — **Auth:** Admin/Manager

#### `GET /api/dashboard/hourly-revenue` — **Auth:** Admin/Manager

**Response:**

```json
[
  { "hour": "6PM", "vip": 120, "bar": 80, "terrace": 40, "cabana": 200 },
  { "hour": "7PM", "vip": 280, "bar": 160, "terrace": 90, "cabana": 380 }
]
```

---

### 8.13 Admin Configuration

#### `GET /api/config` — **Auth:** Admin

**Response:**

```json
{
  "serviceCharge": 10,
  "vatRate": 7,
  "currency": "USD",
  "currencySymbol": "$",
  "printerIp": "192.168.1.100",
  "printerPort": 9100,
  "houseRules": "Welcome to SkyBar...",
  "receiptHeader": "SkyBar Rooftop Lounge\nLevel 32, Skyline Tower",
  "receiptFooter": "Thank you for visiting SkyBar!"
}
```

#### `PUT /api/config` — **Auth:** Admin (partial updates supported)

#### `POST /api/config/printer/test` — **Auth:** Admin

Opens a **TCP socket** to `printerIp:printerPort` (typical ESC/POS **9100**) with a short timeout. This is **not** ICMP ping.

**Request:**

```json
{
  "printerIp": "192.168.1.100",
  "printerPort": 9100
}
```

**Response:**

```json
{
  "connected": false,
  "message": "Connection timed out: 172.19.14.1:9100",
  "printerIp": "172.19.14.1",
  "printerPort": 9100,
  "latencyMs": null
}
```

**Backend rules (required for UI dots to be honest):**

- Set **`connected: true`** only after a successful TCP connect (then close socket).
- Set **`connected: false`** on timeout, refused connection, or unreachable host.
- Do **not** return stub `connected: true` when the host is down (front-end treats messages containing `stub` / `mock` as failure).
- Optional: set **`latencyMs`** on success.

**Front-end:** Admin Config runs this endpoint **5 times** for blue/red dots (venue default + zone rows use the IP/port from the form).

---

### 8.14 Notifications

#### `GET /api/notifications`

Query: `?type=stock|order|booking|system`, `?read=true|false`

#### `GET /api/notifications/unread-count`

**Response:**

```json
{
  "total": 7,
  "stock": 3,
  "order": 2,
  "booking": 1,
  "system": 1
}
```

#### `PATCH /api/notifications/{notificationId}/read`

#### `PATCH /api/notifications/read-all`

#### `DELETE /api/notifications/{notificationId}`

#### `DELETE /api/notifications/clear-read`

#### `POST /api/notifications` — Internal / Admin/Manager

**Request:**

```json
{
  "type": "stock",
  "priority": "critical",
  "title": "Critical Stock: Hendrick's Gin",
  "message": "Only 1 bottle remaining",
  "meta": "Spirits · 1 bottle left",
  "targetRoles": ["Admin", "Manager"]
}
```

---

### 8.15 Real-Time Events (WebSocket / SSE)

#### WebSocket — STOMP over SockJS

**Endpoint:** `WS http://localhost:8080/ws/pos`

**Connect headers:**

```
Authorization: Bearer <token>
```

**Subscribe topics:**

| Topic                       | Event                  | Payload                                                                       |
| --------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `/topic/orders/new`         | `ORDER_CREATED`        | tableId, tableLabel, zone, staff, items, orderId, timestamp                   |
| `/topic/kds/updates`        | `KDS_STATUS_CHANGED`   | ticketId, tableLabel, previousStatus, newStatus, items                        |
| `/topic/tables/status`      | `TABLE_STATUS_CHANGED` | tableId, previousStatus, newStatus, guests                                    |
| `/topic/bookings/reminders` | `BOOKING_REMINDER`     | bookingId, guestName, tableLabel, arrivalTime, partySize, minutesUntilArrival |

**Spring Boot implementation:**

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/pos").setAllowedOriginPatterns("*").withSockJS();
    }
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
```

**Booking reminders:** Use `@Scheduled(cron = "0 * * * * *")` every minute to query bookings arriving in 15 minutes and broadcast via `SimpMessagingTemplate.convertAndSend("/topic/bookings/reminders", payload)`.

#### SSE Fallback

**Endpoint:** `GET /api/events/orders`

Stream format:

```
event: ORDER_CREATED
data: {"event":"ORDER_CREATED","tableLabel":"Table V1",...}

event: KDS_UPDATE
data: {"ticketId":"kds-001","status":"Ready",...}
```

#### `POST /api/orders/notify` — Internal broadcast trigger

---

### 8.16 Stock Management

#### `GET /api/stock` — Query: `?category=`, `?status=`

#### `GET /api/stock/{stockItemId}`

#### `GET /api/stock/alerts` — Items below reorder threshold

#### `GET /api/stock/{stockItemId}/history` — Query: `?limit=`, `?from=`, `?to=`

#### `POST /api/stock` — **Auth:** Admin/Manager

**Request:**

```json
{
  "name": "Aperol",
  "category": "Liqueurs",
  "unit": "bottles",
  "currentStock": 6,
  "reorderThreshold": 3,
  "maxStock": 12
}
```

#### `PUT /api/stock/{stockItemId}` — **Auth:** Admin/Manager

#### `PATCH /api/stock/{stockItemId}/count`

**Request:**

```json
{
  "currentStock": 5,
  "updatedBy": "Alex",
  "note": "Manual adjustment"
}
```

#### `POST /api/stock/bulk-update`

**Request:**

```json
{
  "updates": [
    { "id": "stock-s1", "currentStock": 4 },
    { "id": "stock-s2", "currentStock": 1 }
  ],
  "updatedBy": "Alex",
  "note": "Evening inventory count"
}
```

#### `POST /api/stock/reconcile` — **Auth:** Manager/Admin

End-of-shift inventory reconciliation.

#### `GET /api/stock/reconciliations` — **Auth:** Manager/Admin

#### `GET /api/stock/reconciliations/{reconciliationId}` — **Auth:** Manager/Admin

#### `DELETE /api/stock/{stockItemId}` — **Auth:** Admin

---

### 8.17 Staff Management & PIN

> Note: Overlaps with `/api/users` but adds PIN management and `hasPin` field.

#### `GET /api/staff` — **Auth:** Admin

#### `GET /api/staff/{staffId}` — **Auth:** Admin

#### `POST /api/staff` — **Auth:** Admin

#### `PUT /api/staff/{staffId}` — **Auth:** Admin

#### `DELETE /api/staff/{staffId}` — **Auth:** Admin

#### `PATCH /api/staff/{staffId}/toggle-status` — **Auth:** Admin

#### `POST /api/staff/{staffId}/pin` — **Auth:** Admin or self

**Request:** `{ "pin": "1234" }`  
Store as bcrypt hash in `staff_pins` table.

#### `POST /api/staff/{staffId}/pin/verify`

**Request:** `{ "pin": "1234" }`  
**Response:** `{ "success": true, "staffId": "u2", "name": "Jordan Lee", "role": "Bartender" }`

#### `DELETE /api/staff/{staffId}/pin` — **Auth:** Admin

---

### 8.18 Analytics & Reporting

All endpoints support query: `?range=today|yesterday|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`

#### `GET /api/analytics/summary` — **Auth:** Admin/Manager

**Response:**

```json
{
  "totalRevenue": 55240,
  "totalOrders": 642,
  "avgOrderValue": 86.04,
  "totalCovers": 1136,
  "hourlyRevenue": [{ "hour": "12PM", "revenue": 1240, "orders": 18 }],
  "topItems": [
    {
      "name": "Signature Skyline Cocktail",
      "menuItemId": "mi-001",
      "category": "Cocktails",
      "qty": 142,
      "revenue": 4970
    }
  ],
  "tableTurnover": [
    { "zone": "VIP Edge Skyline", "avgMinutes": 94, "turns": 3.2, "revenue": 18400 }
  ],
  "staffPerformance": [
    {
      "staffId": "u2",
      "name": "Jordan Lee",
      "role": "Bartender",
      "orders": 184,
      "revenue": 9240,
      "avgOrderValue": 50.2,
      "covers": 312
    }
  ]
}
```

#### `GET /api/analytics/hourly-revenue` — **Auth:** Admin/Manager

#### `GET /api/analytics/top-items` — Query: `?limit=10`

#### `GET /api/analytics/table-turnover` — **Auth:** Admin/Manager

#### `GET /api/analytics/staff-performance` — Query: `?staffId=u2`

#### `GET /api/analytics/transactions` — **Auth:** Admin/Manager

Used by **Reports** (`/reports`) for the orders table. Query: same as summary (`range`, `from`, `to`).

**Do not** return `"unknown"` / `"Unknown"` for staff when a user id exists. Join `payments.staff_id` (or `cashier_id`) → `users.id`.

**Response (each row):**

```json
{
  "id": "pay-001",
  "tableId": "table-v3",
  "tableLabel": "V3",
  "amount": 79.86,
  "method": "Room",
  "time": "2026-10-09T05:47:00Z",
  "openedAt": "2026-10-09T04:05:00Z",
  "closedAt": "2026-10-09T05:47:00Z",
  "staffId": "u1",
  "staffName": "Alex Miller",
  "items": 2
}
```

> List `time` = close time; prefer `closedAt` when present.

**`staffPerformance[]` in summary** must use the same join — never aggregate under a literal `"unknown"` key; use real `staffId` + `name` + `role` from `users`.

**On payment:** `POST /api/payments` accepts optional `staffId` / `cashierId` (logged-in user). Persist on `payments` row for analytics.

List rows should include `paymentId` (same as `id` if payment pk) and `orderId` when available.

#### `GET /api/analytics/transactions/{paymentId}` — **Auth:** Admin/Manager (Bearer)

Used when user clicks the **eye** icon on Reports → Orders. Same payload shape as **`GET /api/orders/details/{orderId}`** (loads full order when `payment.orderId` is set via `getOrderDetailByPaymentId`).

**Merge / split (Reports UI):**

| Field | Meaning |
|--------|--------|
| `hasMerge` | `true` if this order had table merge(s) |
| `hasSplit` | `true` if this order had a split bill |
| `hasTransfer` | `true` if guests moved table (transfer events) |
| `merges[]` | Source → target table, time, items moved, staff |
| `splits[]` | Split session: count, total, `paymentIds[]`, time |
| `transfers[]` | Source → target table, time, guests, staff |

Legacy payments without `orderId` may still populate **`splits[]`** from `splitGroupId`. Older checks may return empty arrays with flags only.

**Important:** Do **not** return 4xx with `"No order linked to payment"` when the payment row exists. Return **HTTP 200** with payment fields and `"orderId": null`, `"items": []` if the order was cleared or never linked. Link `payments.order_id` (or `table_session_id`) in `POST /api/payments` when the check is paid.

**Response:**

```json
{
  "paymentId": "pay-001",
  "orderId": "ord-table-v3-20261009",
  "tableSessionId": "ts-8842",
  "shiftId": "SH-2026-1009-01",
  "tableId": "table-v3",
  "tableLabel": "V3",
  "zoneId": "vip",
  "zoneLabel": "VIP Edge Skyline",
  "type": "sale",
  "method": "Room",
  "amount": 79.86,
  "subtotal": 66.0,
  "serviceCharge": 6.6,
  "vat": 7.26,
  "discount": 0,
  "covers": 4,
  "openedAt": "2026-10-09T17:05:00Z",
  "closedAt": "2026-10-09T19:47:00Z",
  "durationMinutes": 162,
  "staffId": "u1",
  "staffName": "Alex Miller",
  "staffRole": "Admin",
  "cashierId": "u1",
  "cashierName": "Alex Miller",
  "roomNumber": "1202",
  "cashTendered": null,
  "changeAmount": 0,
  "legacyPayment": false,
  "time": "2026-10-09T19:47:00Z",
  "hasMerge": true,
  "hasSplit": false,
  "merges": [
    {
      "sourceTableLabel": "V2",
      "targetTableLabel": "V3",
      "time": "2026-10-09T17:20:00Z",
      "itemsMoved": 3,
      "staffName": "Jordan Lee"
    }
  ],
  "splits": [],
  "split": null,
  "merge": null,
  "payments": [
    {
      "paymentId": "pay-001",
      "method": "Room",
      "amount": 79.86,
      "paidAt": "2026-10-09T19:47:00Z",
      "closedAt": "2026-10-09T19:47:00Z",
      "time": "2026-10-09T19:47:00Z",
      "staffId": "u1",
      "staffName": "Alex Miller",
      "staffRole": "Admin"
    }
  ],
  "items": [
    { "id": "item-1", "name": "Signature Cocktail", "qty": 2, "unitPrice": 28, "status": "Served" }
  ],
  "receiptUrl": "/api/receipts/pay-001"
}
```

**Legacy payment (no `order_id`):** same shape with `"legacyPayment": true`, `"orderId": null`, `"items": []` — still **HTTP 200** (not 404).

#### `GET /api/orders/details/{orderId}` — **Auth:** Admin/Manager (Bearer)

Same **`OrderDetailResponse`** as payment detail — line items, totals, payments, **`hasMerge` / `hasSplit` / `merges[]` / `splits[]`**.

**Response:**

```json
{
  "orderId": "ord-table-v3-20261009",
  "tableId": "table-v3",
  "tableLabel": "V3",
  "zoneLabel": "VIP Edge Skyline",
  "status": "closed",
  "covers": 4,
  "openedAt": "2026-10-09T17:05:00Z",
  "closedAt": "2026-10-09T19:47:00Z",
  "staffId": "u2",
  "staffName": "Jordan Lee",
  "subtotal": 66.0,
  "serviceCharge": 6.6,
  "vat": 7.26,
  "total": 79.86,
  "items": [
    {
      "id": "item-1",
      "name": "Signature Cocktail",
      "qty": 2,
      "unitPrice": 28,
      "status": "Served",
      "notes": ""
    }
  ],
  "payments": [
    {
      "paymentId": "pay-001",
      "method": "Room",
      "amount": 79.86,
      "paidAt": "2026-10-09T19:47:00Z",
      "closedAt": "2026-10-09T19:47:00Z",
      "time": "2026-10-09T19:47:00Z",
      "staffName": "Alex Miller"
    }
  ],
  "hasMerge": false,
  "hasSplit": true,
  "merges": [],
  "splits": [
    {
      "splitCount": 2,
      "total": 79.86,
      "paymentIds": ["pay-001", "pay-002"],
      "time": "2026-10-09T19:47:00Z"
    }
  ],
  "merge": null,
  "split": null
}
```

---

## 9. Suggested Database Tables

```
users              staff_pins           zones              zone_printers
tables             menu_items           menu_item_sizes    orders
order_items        kds_tickets          bookings           payments
payment_splits     shifts               shift_transactions venue_config
stock_items        stock_history        stock_reconciliations
notifications      ws_sessions          analytics_snapshots
staff_shifts       staff_availability   kds_assignments
```

---

## 10. com.posapi Package Structure

This matches your existing backend layout. Place new code in these packages:

```
com.posapi
├── PosApiApplication.java              ← existing entry point
│
├── config/
│   ├── CorsGlobalConfig.java           ← existing — allow http://localhost:4028
│   ├── SecurityConfig.java             ← JWT filter, public routes
│   ├── WebSocketConfig.java            ← STOMP /ws/pos
│   └── JwtProperties.java              ← secret + expiration from application.properties
│
├── controller/
│   ├── AbstractRestController.java     ← existing base (shared helpers, error wrapping)
│   ├── HealthController.java           ← existing health check
│   ├── AuthController.java             ← /api/auth/*
│   ├── TableController.java            ← /api/tables/*
│   ├── ZoneController.java             ← /api/zones/*
│   ├── OrderController.java            ← /api/orders/*
│   ├── MenuController.java             ← /api/menu/*
│   ├── KdsController.java              ← /api/kds/*
│   ├── PaymentController.java          ← /api/payments/*, /api/receipts/*
│   ├── BookingController.java          ← /api/bookings/*
│   ├── RosterController.java           ← /api/roster/*
│   ├── UserController.java             ← /api/users/*
│   ├── StaffController.java            ← /api/staff/*
│   ├── ShiftController.java            ← /api/shifts/*
│   ├── DashboardController.java        ← /api/dashboard/*
│   ├── ConfigController.java           ← /api/config/*
│   ├── NotificationController.java     ← /api/notifications/*
│   ├── StockController.java            ← /api/stock/*
│   ├── AnalyticsController.java        ← /api/analytics/*
│   ├── EventController.java            ← /api/events/* (SSE fallback)
│   └── ceo/                            ← existing admin/executive controllers (keep separate)
│
├── payload/
│   ├── request/                        ← @Valid request DTOs (see §12)
│   └── response/                       ← response DTOs (see §12)
│
├── domain/                             ← JPA @Entity classes (see §13)
│
├── service/                            ← business logic (one service per module)
│   ├── AuthService.java
│   ├── TableService.java
│   ├── ZoneService.java
│   ├── OrderService.java
│   ├── MenuService.java
│   ├── KdsService.java
│   ├── PaymentService.java
│   ├── BookingService.java
│   ├── RosterService.java
│   ├── UserService.java
│   ├── StaffService.java
│   ├── ShiftService.java
│   ├── DashboardService.java
│   ├── ConfigService.java
│   ├── NotificationService.java
│   ├── StockService.java
│   └── AnalyticsService.java
│
├── converter/                          ← Entity ↔ Payload mappers (MapStruct or manual)
│   ├── TableConverter.java
│   ├── OrderConverter.java
│   └── ...
│
├── enums/                              ← shared enums (see §14)
│
├── exception/
│   ├── ApiException.java
│   ├── ResourceNotFoundException.java
│   └── GlobalExceptionHandler.java     ← returns §4 error JSON shape
│
├── Printer/                            ← existing printer integration
│   └── ReceiptPrinterService.java      ← used by PaymentController + ConfigController
│
├── support/                            ← JWT, security helpers
│   ├── JwtTokenProvider.java
│   └── JwtAuthenticationFilter.java
│
├── util/ / utils/                      ← consolidate over time; date/money helpers
│
└── scheduler/
    └── BookingReminderScheduler.java   ← @Scheduled → WebSocket broadcast
```

### Layer flow (per request)

```
HTTP Request
  → controller/*Controller.java     (@RestController, validates @RequestBody payload)
  → service/*Service.java           (business rules, transactions)
  → domain/*Repository.java         (Spring Data JPA)
  → converter/*Converter.java       (Entity → payload.response)
  → JSON response
```

### Repository placement

Add Spring Data repositories alongside entities:

```
com.posapi.domain
├── User.java
├── UserRepository.java
├── TableEntity.java
├── TableRepository.java
└── ...
```

Or use `com.posapi.repository` if you prefer a separate package — either works; stay consistent within the project.

---

## 11. Complete Endpoint Matrix

Every row is required for full frontend compatibility. **Auth** column: `Public` = no JWT; `Bearer` = JWT required; role suffix = `@PreAuthorize`.

### Auth (`AuthController`)

| Method | Path                       | Auth   | Request DTO               | Response DTO               |
| ------ | -------------------------- | ------ | ------------------------- | -------------------------- |
| POST   | `/auth/login`              | Public | `LoginRequest`            | `LoginResponse`            |
| POST   | `/auth/logout`             | Bearer | —                         | `MessageResponse`          |
| POST   | `/auth/refresh`            | Public | `RefreshTokenRequest`     | `TokenResponse`            |
| GET    | `/auth/me`                 | Bearer | —                         | `StaffUserResponse`        |
| POST   | `/auth/manager-pin/verify` | Bearer | `ManagerPinVerifyRequest` | `ManagerPinVerifyResponse` |

### Users (`UserController`)

| Method | Path                   | Auth  | Request DTO             | Response DTO              |
| ------ | ---------------------- | ----- | ----------------------- | ------------------------- |
| GET    | `/users`               | Admin | query: `role`, `status` | `List<StaffUserResponse>` |
| GET    | `/users/{id}`          | Admin | —                       | `StaffUserResponse`       |
| POST   | `/users`               | Admin | `CreateUserRequest`     | `StaffUserResponse`       |
| PUT    | `/users/{id}`          | Admin | `UpdateUserRequest`     | `StaffUserResponse`       |
| DELETE | `/users/{id}`          | Admin | —                       | `MessageResponse`         |
| PATCH  | `/users/{id}/status`   | Admin | `UserStatusRequest`     | `StaffUserResponse`       |
| PATCH  | `/users/{id}/password` | Admin | `ResetPasswordRequest`  | `MessageResponse`         |

### Staff & PIN (`StaffController`)

| Method | Path                        | Auth       | Request DTO         | Response DTO              |
| ------ | --------------------------- | ---------- | ------------------- | ------------------------- |
| GET    | `/staff`                    | Admin      | —                   | `List<StaffUserResponse>` |
| GET    | `/staff/{id}`               | Admin      | —                   | `StaffUserResponse`       |
| POST   | `/staff`                    | Admin      | `CreateUserRequest` | `StaffUserResponse`       |
| PUT    | `/staff/{id}`               | Admin      | `UpdateUserRequest` | `StaffUserResponse`       |
| DELETE | `/staff/{id}`               | Admin      | —                   | `MessageResponse`         |
| PATCH  | `/staff/{id}/toggle-status` | Admin      | —                   | `StaffUserResponse`       |
| POST   | `/staff/{id}/pin`           | Admin/Self | `SetPinRequest`     | `PinActionResponse`       |
| POST   | `/staff/{id}/pin/verify`    | Public\*   | `SetPinRequest`     | `PinVerifyResponse`       |
| DELETE | `/staff/{id}/pin`           | Admin      | —                   | `PinActionResponse`       |

\* PIN verify is called before JWT exists at login — keep public or use a pre-auth token.

### Zones (`ZoneController`)

| Method | Path                                        | Auth   | Request DTO                | Response DTO                |
| ------ | ------------------------------------------- | ------ | -------------------------- | --------------------------- |
| GET    | `/zones`                                    | Bearer | —                          | `List<ZoneResponse>`        |
| GET    | `/zones/{id}`                               | Bearer | —                          | `ZoneResponse`              |
| POST   | `/zones`                                    | Admin  | `CreateZoneRequest`        | `ZoneResponse`              |
| PUT    | `/zones/{id}`                               | Admin  | `UpdateZoneRequest`        | `ZoneResponse`              |
| DELETE | `/zones/{id}`                               | Admin  | —                          | `MessageResponse`           |
| PATCH  | `/zones/{id}/toggle`                        | Admin  | —                          | `ZoneResponse`              |
| GET    | `/zones/{zoneId}/printers`                  | Admin  | —                          | `List<ZonePrinterResponse>` |
| POST   | `/zones/{zoneId}/printers`                  | Admin  | `CreateZonePrinterRequest` | `ZonePrinterResponse`       |
| PUT    | `/zones/{zoneId}/printers/{printerId}`      | Admin  | `UpdateZonePrinterRequest` | `ZonePrinterResponse`       |
| DELETE | `/zones/{zoneId}/printers/{printerId}`      | Admin  | —                          | `MessageResponse`           |
| POST   | `/zones/{zoneId}/printers/{printerId}/test` | Admin  | —                          | `PrinterTestResponse`       |

### Tables (`TableController`)

| Method | Path                    | Auth     | Request DTO                  | Response DTO            |
| ------ | ----------------------- | -------- | ---------------------------- | ----------------------- |
| GET    | `/tables`               | Bearer   | query: `zone`                | `List<TableResponse>`   |
| GET    | `/tables/{id}`          | Bearer   | —                            | `TableResponse`         |
| POST   | `/tables`               | Manager+ | `CreateTableRequest`         | `TableResponse`         |
| PUT    | `/tables/{id}`          | Manager+ | `UpdateTableRequest`         | `TableResponse`         |
| DELETE | `/tables/{id}`          | Admin    | —                            | `MessageResponse`       |
| PATCH  | `/tables/{id}/status`   | Bearer   | `UpdateTableStatusRequest`   | `TableResponse`         |
| PATCH  | `/tables/{id}/position` | Manager+ | `UpdateTablePositionRequest` | `TableResponse`         |
| POST   | `/tables/merge`         | Manager+ | `MergeTablesRequest`         | `MergeTablesResponse`   |
| POST   | `/tables/transfer`      | Manager+ | `TransferTableRequest`       | `TransferTableResponse` |

### Orders (`OrderController`)

| Method | Path                                    | Auth        | Request DTO                | Response DTO               |
| ------ | --------------------------------------- | ----------- | -------------------------- | -------------------------- |
| GET    | `/orders`                               | Bearer      | query: `tableId`, `status` | `List<TableOrderResponse>` |
| GET    | `/orders/{tableId}`                     | Bearer      | —                          | `TableOrderResponse`       |
| POST   | `/orders/{tableId}/items`               | Bearer      | `AddOrderItemsRequest`     | `AddOrderItemsResponse`    |
| PATCH  | `/orders/{tableId}/items/{itemId}/void` | Manager PIN | `VoidOrderItemRequest`     | `OrderItemResponse`        |
| DELETE | `/orders/{tableId}`                     | Bearer      | —                          | `MessageResponse`          |

### Menu (`MenuController`)

| Method | Path                      | Auth     | Request DTO               | Response DTO               |
| ------ | ------------------------- | -------- | ------------------------- | -------------------------- |
| GET    | `/menu`                   | Bearer   | —                         | `List<MenuItemResponse>`   |
| GET    | `/menu/categories`        | Bearer   | —                         | `List<String>`             |
| POST   | `/menu`                   | Manager+ | `CreateMenuItemRequest`   | `MenuItemResponse`         |
| PUT    | `/menu/{id}`              | Manager+ | `UpdateMenuItemRequest`   | `MenuItemResponse`         |
| DELETE | `/menu/{id}`              | Admin    | —                         | `MessageResponse`          |
| PATCH  | `/menu/{id}/availability` | Manager+ | `MenuAvailabilityRequest` | `MenuAvailabilityResponse` |

### KDS (`KdsController`)

| Method | Path                        | Auth   | Request DTO     | Response DTO              |
| ------ | --------------------------- | ------ | --------------- | ------------------------- |
| GET    | `/kds/tickets`              | Bearer | query: `status` | `List<KdsTicketResponse>` |
| PATCH  | `/kds/tickets/{id}/advance` | Bearer | —               | `KdsTicketResponse`       |
| PATCH  | `/kds/tickets/{id}/recall`  | Bearer | —               | `KdsTicketResponse`       |
| DELETE | `/kds/tickets/{id}`         | Bearer | —               | `MessageResponse`         |

### Payments (`PaymentController`)

| Method | Path                    | Auth   | Request DTO             | Response DTO             |
| ------ | ----------------------- | ------ | ----------------------- | ------------------------ |
| POST   | `/payments`             | Bearer | `ProcessPaymentRequest` | `ProcessPaymentResponse` |
| POST   | `/payments/split`       | Bearer | `SplitPaymentRequest`   | `SplitPaymentResponse`   |
| GET    | `/receipts/{paymentId}` | Bearer | —                       | `ReceiptResponse`        |

### Bookings (`BookingController`)

| Method | Path                           | Auth     | Request DTO                     | Response DTO                  |
| ------ | ------------------------------ | -------- | ------------------------------- | ----------------------------- |
| GET    | `/bookings`                    | Bearer   | query: `date`, `zone`, `status` | `List<BookingResponse>`       |
| GET    | `/bookings/{id}`               | Bearer   | —                               | `BookingResponse`             |
| POST   | `/bookings`                    | Bearer   | `CreateBookingRequest`          | `BookingResponse`             |
| PUT    | `/bookings/{id}`               | Bearer   | `UpdateBookingRequest`          | `BookingResponse`             |
| DELETE | `/bookings/{id}`               | Manager+ | —                               | `MessageResponse`             |
| PATCH  | `/bookings/{id}/seat`          | Bearer   | —                               | `BookingResponse`             |
| PATCH  | `/bookings/{id}/cancel`        | Bearer   | —                               | `BookingResponse`             |
| GET    | `/bookings/reminders/upcoming` | Manager+ | —                               | `List<BookingResponse>`       |
| POST   | `/bookings/{id}/reminder/test` | Manager+ | —                               | `BookingReminderTestResponse` |

### Shifts (`ShiftController`)

| Method | Path                             | Auth     | Request DTO              | Response DTO                      |
| ------ | -------------------------------- | -------- | ------------------------ | --------------------------------- |
| GET    | `/shifts/current`                | Bearer   | —                        | `ShiftSummaryResponse`            |
| POST   | `/shifts/open`                   | Manager+ | `OpenShiftRequest`       | `ShiftSummaryResponse`            |
| POST   | `/shifts/close`                  | Manager+ | `CloseShiftRequest`      | `CloseShiftResponse`              |
| GET    | `/shifts/{shiftId}/transactions` | Bearer   | —                        | `List<RecentTransactionResponse>` |
| POST   | `/shifts/drawer/reconcile`       | Manager+ | `DrawerReconcileRequest` | `DrawerReconcileResponse`         |

### Dashboard (`DashboardController`)

| Method | Path                           | Auth     | Request DTO | Response DTO                      |
| ------ | ------------------------------ | -------- | ----------- | --------------------------------- |
| GET    | `/dashboard/summary`           | Manager+ | —           | `DashboardKpiResponse`            |
| GET    | `/dashboard/zone-revenue`      | Manager+ | —           | `List<ZoneRevenueResponse>`       |
| GET    | `/dashboard/top-items`         | Manager+ | —           | `List<TopItemResponse>`           |
| GET    | `/dashboard/payment-breakdown` | Manager+ | —           | `List<PaymentBreakdownResponse>`  |
| GET    | `/dashboard/hourly-revenue`    | Manager+ | —           | `List<HourlyZoneRevenueResponse>` |

### Config (`ConfigController`)

| Method | Path                   | Auth  | Request DTO                | Response DTO           |
| ------ | ---------------------- | ----- | -------------------------- | ---------------------- |
| GET    | `/config`              | Admin | —                          | `VenueConfigResponse`  |
| PUT    | `/config`              | Admin | `UpdateVenueConfigRequest` | `ConfigUpdateResponse` |
| POST   | `/config/printer/test` | Admin | `PrinterTestRequest`       | `PrinterTestResponse`  |

### Notifications (`NotificationController`)

| Method | Path                          | Auth     | Request DTO                 | Response DTO                 |
| ------ | ----------------------------- | -------- | --------------------------- | ---------------------------- |
| GET    | `/notifications`              | Bearer   | query: `type`, `read`       | `List<NotificationResponse>` |
| GET    | `/notifications/unread-count` | Bearer   | —                           | `UnreadCountResponse`        |
| PATCH  | `/notifications/{id}/read`    | Bearer   | —                           | `NotificationResponse`       |
| PATCH  | `/notifications/read-all`     | Bearer   | —                           | `BulkUpdateResponse`         |
| DELETE | `/notifications/{id}`         | Bearer   | —                           | `MessageResponse`            |
| DELETE | `/notifications/clear-read`   | Bearer   | —                           | `BulkDeleteResponse`         |
| POST   | `/notifications`              | Manager+ | `CreateNotificationRequest` | `NotificationResponse`       |

### Stock (`StockController`)

| Method | Path                          | Auth     | Request DTO                    | Response DTO                   |
| ------ | ----------------------------- | -------- | ------------------------------ | ------------------------------ |
| GET    | `/stock`                      | Bearer   | query: `category`, `status`    | `List<StockItemResponse>`      |
| GET    | `/stock/alerts`               | Bearer   | —                              | `List<StockItemResponse>`      |
| GET    | `/stock/{id}`                 | Bearer   | —                              | `StockItemResponse`            |
| GET    | `/stock/{id}/history`         | Bearer   | query: `limit`, `from`, `to`   | `List<StockHistoryResponse>`   |
| POST   | `/stock`                      | Manager+ | `CreateStockItemRequest`       | `StockItemResponse`            |
| PUT    | `/stock/{id}`                 | Manager+ | `UpdateStockItemRequest`       | `StockItemResponse`            |
| PATCH  | `/stock/{id}/count`           | Bearer   | `UpdateStockCountRequest`      | `StockItemResponse`            |
| POST   | `/stock/bulk-update`          | Bearer   | `BulkStockUpdateRequest`       | `List<StockItemResponse>`      |
| POST   | `/stock/reconcile`            | Manager+ | `StockReconcileRequest`        | `StockReconcileResponse`       |
| GET    | `/stock/reconciliations`      | Manager+ | query: `shiftId`, `from`, `to` | `List<StockReconcileResponse>` |
| GET    | `/stock/reconciliations/{id}` | Manager+ | —                              | `StockReconcileResponse`       |
| DELETE | `/stock/{id}`                 | Admin    | —                              | `MessageResponse`              |

### Analytics (`AnalyticsController`)

| Method | Path                           | Auth     | Request DTO                  | Response DTO                     |
| ------ | ------------------------------ | -------- | ---------------------------- | -------------------------------- |
| GET    | `/analytics/summary`           | Manager+ | query: `range`, `from`, `to` | `AnalyticsSummaryResponse`       |
| GET    | `/analytics/hourly-revenue`    | Manager+ | query: `range`, `from`, `to` | `List<AnalyticsHourlyResponse>`  |
| GET    | `/analytics/top-items`         | Manager+ | query: `range`, `limit`      | `List<AnalyticsTopItemResponse>` |
| GET    | `/analytics/table-turnover`    | Manager+ | query: `range`               | `List<TableTurnoverResponse>`    |
| GET    | `/analytics/staff-performance` | Manager+ | query: `range`, `staffId`    | `List<StaffPerformanceResponse>` |

### Roster (`RosterController`)

| Method | Path                             | Auth     | Request DTO                             | Response DTO                      |
| ------ | -------------------------------- | -------- | --------------------------------------- | --------------------------------- |
| GET    | `/roster/shifts`                 | Manager+ | query: `weekStart`, `staffId`, `zoneId` | `List<StaffShiftResponse>`        |
| POST   | `/roster/shifts`                 | Manager+ | `CreateShiftRequest`                    | `StaffShiftResponse`              |
| PUT    | `/roster/shifts/{id}`            | Manager+ | `UpdateShiftRequest`                    | `StaffShiftResponse`              |
| DELETE | `/roster/shifts/{id}`            | Manager+ | —                                       | `MessageResponse`                 |
| GET    | `/roster/availability`           | Manager+ | —                                       | `List<StaffAvailabilityResponse>` |
| PUT    | `/roster/availability/{staffId}` | Manager+ | `UpdateAvailabilityRequest`             | `StaffAvailabilityResponse`       |
| GET    | `/roster/kds-assignments`        | Manager+ | —                                       | `List<KdsAssignmentResponse>`     |
| PATCH  | `/roster/shifts/{id}/kds`        | Manager+ | `ToggleKdsRequest`                      | `StaffShiftResponse`              |

### Real-Time

| Type      | Endpoint                 | Notes                 |
| --------- | ------------------------ | --------------------- |
| WebSocket | `WS /ws/pos`             | STOMP topics in §8.15 |
| SSE       | `GET /api/events/orders` | Optional fallback     |

---

## 12. Payload DTO Catalog

Place all DTOs under `com.posapi.payload.request` and `com.posapi.payload.response`.  
Field names must match frontend `types.ts` exactly (camelCase JSON).

### Request DTOs (`payload/request/`)

| Java class                   | TS interface              | Key fields                                                          |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `LoginRequest`               | `LoginRequest`            | `email`, `password`                                                 |
| `RefreshTokenRequest`        | —                         | `refreshToken`                                                      |
| `ManagerPinVerifyRequest`    | `ManagerPinVerifyRequest` | `pin`, `action`                                                     |
| `CreateUserRequest`          | `CreateUserRequest`       | `name`, `email`, `role`, `terminalId?`, `password`                  |
| `UpdateUserRequest`          | `UpdateUserRequest`       | `name?`, `email?`, `role?`, `terminalId?`                           |
| `UserStatusRequest`          | —                         | `status` (`active` \| `inactive`)                                   |
| `ResetPasswordRequest`       | —                         | `newPassword`                                                       |
| `SetPinRequest`              | `SetPinRequest`           | `pin`                                                               |
| `CreateZoneRequest`          | `CreateZoneRequest`       | `label`, `description`, `color`, `canvasWidth`, `canvasHeight`      |
| `UpdateZoneRequest`          | `UpdateZoneRequest`       | partial zone fields                                                 |
| `CreateTableRequest`         | `CreateTableRequest`      | `label`, `zone`, `capacity`, `shape`, `x`, `y`, `minSpend?`         |
| `UpdateTableStatusRequest`   | —                         | `status`, `guests?`, `staff?`                                       |
| `UpdateTablePositionRequest` | —                         | `x`, `y`                                                            |
| `MergeTablesRequest`         | `MergeTablesRequest`      | `sourceTableId`, `targetTableId`                                    |
| `TransferTableRequest`       | `TransferTableRequest`    | `sourceTableId`, `targetTableId`                                    |
| `AddOrderItemsRequest`       | `AddOrderItemsRequest`    | `items[]`, `staff`                                                  |
| `VoidOrderItemRequest`       | `VoidOrderItemRequest`    | `reason`, `managerApproval?`                                        |
| `ProcessPaymentRequest`      | `ProcessPaymentRequest`   | `tableId`, `method`, `subtotal`, `serviceCharge`, `vat`, `total`, … |
| `SplitPaymentRequest`        | `SplitPaymentRequest`     | `tableId`, `splits[]`                                               |
| `CreateBookingRequest`       | `CreateBookingRequest`    | `tableId`, `guestName`, `phone`, `partySize`, `date`, `time`, …     |
| `UpdateBookingRequest`       | `UpdateBookingRequest`    | partial booking                                                     |
| `OpenShiftRequest`           | `OpenShiftRequest`        | `cashierId`, `openingFloat`, `terminalId`                           |
| `CloseShiftRequest`          | `CloseShiftRequest`       | `countedCash`, `notes?`                                             |
| `DrawerReconcileRequest`     | `DrawerReconcileRequest`  | `shiftId`, `denominations`, `countedTotal`                          |
| `UpdateStockCountRequest`    | `UpdateStockCountRequest` | `currentStock`, `updatedBy?`, `note?`                               |
| `BulkStockUpdateRequest`     | `BulkStockUpdateRequest`  | `updates[]`, `updatedBy?`, `note?`                                  |
| `StockReconcileRequest`      | `StockReconcileRequest`   | `shiftId`, `reconciledBy`, `items[]`                                |
| `CreateShiftRequest`         | `CreateShiftRequest`      | `staffId`, `date`, `startTime`, `endTime`, `zoneId`, `shiftType`    |
| `UpdateVenueConfigRequest`   | `VenueConfig` (partial)   | `serviceCharge`, `vatRate`, `printerIp`, …                          |
| `PrinterTestRequest`         | —                         | `printerIp`, `printerPort`                                          |
| `CreateNotificationRequest`  | —                         | `type`, `priority`, `title`, `message`, `targetRoles?`              |

### Response DTOs (`payload/response/`)

| Java class                 | TS interface              | Notes                                     |
| -------------------------- | ------------------------- | ----------------------------------------- |
| `LoginResponse`            | `LoginResponse`           | `token`, `refreshToken?`, `user`          |
| `StaffUserResponse`        | `StaffUser`               | include `hasPin` for staff list           |
| `ZoneResponse`             | `ZoneData`                |                                           |
| `ZonePrinterResponse`      | `ZonePrinter`             |                                           |
| `TableResponse`            | `TableData`               |                                           |
| `TableOrderResponse`       | `TableOrder`              | nested `OrderItemResponse[]`              |
| `AddOrderItemsResponse`    | —                         | `addedItems[]`, `kdsTicketId`             |
| `KdsTicketResponse`        | `KDSTicket`               |                                           |
| `MenuItemResponse`         | `ApiMenuItem`             | nested `MenuItemSizeResponse[]`           |
| `ProcessPaymentResponse`   | `ProcessPaymentResponse`  |                                           |
| `SplitPaymentResponse`     | `SplitPaymentResponse`    |                                           |
| `BookingResponse`          | `Booking`                 |                                           |
| `ShiftSummaryResponse`     | `ShiftSummary`            |                                           |
| `CloseShiftResponse`       | `CloseShiftResponse`      |                                           |
| `DrawerReconcileResponse`  | `DrawerReconcileResponse` |                                           |
| `DashboardKpiResponse`     | `DashboardKpiSummary`     |                                           |
| `VenueConfigResponse`      | `VenueConfig`             | numbers may serialize as number or string |
| `NotificationResponse`     | `AppNotification`         |                                           |
| `StockItemResponse`        | `StockItem`               | compute `status` from thresholds          |
| `AnalyticsSummaryResponse` | `AnalyticsSummary`        |                                           |
| `StaffShiftResponse`       | `StaffShift`              |                                           |
| `MessageResponse`          | —                         | `{ "message": "..." }`                    |
| `ApiErrorResponse`         | —                         | §4 error shape                            |

### Example request DTO

```java
package com.posapi.payload.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @Email @NotBlank String email,
    @NotBlank String password
) {}
```

### Example response DTO

```java
package com.posapi.payload.response;

public record StaffUserResponse(
    String id,
    String name,
    String email,
    String role,       // Admin | Manager | Bartender | Cashier
    String status,     // active | inactive | on_shift
    String terminalId,
    String avatar,
    Boolean hasPin
) {}
```

---

## 13. Domain Entity Catalog

Place JPA entities in `com.posapi.domain`:

| Entity                 | Table                    | Key fields                                                                | Used by            |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------- | ------------------ |
| `User`                 | `users`                  | id, name, email, passwordHash, role, status, terminalId, avatar           | Auth, Users, Staff |
| `StaffPin`             | `staff_pins`             | userId, pinHash                                                           | Staff PIN          |
| `Zone`                 | `zones`                  | id, label, description, color, canvasWidth, canvasHeight, isActive        | Zones              |
| `ZonePrinter`          | `zone_printers`          | id, zoneId, name, printerIp, printerPort, isDefault                       | Zones, Printer     |
| `TableEntity`          | `tables`                 | id, label, zoneId, status, guests, capacity, staff, x, y, shape, minSpend | Tables, Orders     |
| `MenuItem`             | `menu_items`             | id, name, category, image, description, popular, available                | Menu               |
| `MenuItemSize`         | `menu_item_sizes`        | menuItemId, label, price                                                  | Menu               |
| `Order`                | `orders`                 | id, tableId, status, subtotal, serviceCharge, vat, total                  | Orders             |
| `OrderItem`            | `order_items`            | id, orderId, menuItemId, name, qty, unitPrice, status, notes, size        | Orders, KDS        |
| `KdsTicket`            | `kds_tickets`            | id, orderId, tableLabel, zone, status, queuedAt, staff                    | KDS                |
| `Payment`              | `payments`               | id, tableId, method, amounts, timestamp                                   | Payments, Shifts   |
| `PaymentSplit`         | `payment_splits`         | paymentId, guestLabel, itemIds, method, amount                            | Payments           |
| `Booking`              | `bookings`               | id, tableId, guestName, phone, partySize, date, time, status              | Bookings           |
| `Shift`                | `shifts`                 | id, cashierId, openedAt, closedAt, openingFloat, totals                   | Shifts             |
| `ShiftTransaction`     | `shift_transactions`     | shiftId, tableId, amount, method, staff                                   | Shifts             |
| `DrawerReconciliation` | `drawer_reconciliations` | shiftId, denominations JSON, variance                                     | Shifts             |
| `StockItem`            | `stock_items`            | id, name, category, unit, currentStock, reorderThreshold                  | Stock              |
| `StockHistory`         | `stock_history`          | stockItemId, type, quantity, previousStock, newStock                      | Stock              |
| `Notification`         | `notifications`          | id, type, priority, title, message, read, targetRoles                     | Notifications      |
| `VenueConfig`          | `venue_config`           | singleton row: serviceCharge, vatRate, printer settings                   | Config             |
| `StaffShift`           | `staff_shifts`           | staffId, date, startTime, endTime, zoneId, kdsAssigned                    | Roster             |
| `StaffAvailability`    | `staff_availability`     | staffId, weeklyAvailability JSON                                          | Roster             |

Use `converter/*Converter` to map Entity → Response DTO. Never expose `passwordHash` or `pinHash` in payloads.

---

## 14. Enums & Converters

Place in `com.posapi.enums`:

| Java enum          | JSON values                                      | Used in          |
| ------------------ | ------------------------------------------------ | ---------------- |
| `UserRole`         | `Admin`, `Manager`, `Bartender`, `Cashier`       | User, Staff      |
| `UserStatus`       | `active`, `inactive`, `on_shift`                 | User             |
| `TableStatus`      | `available`, `occupied`, `reserved`, `bill`      | Table            |
| `TableShape`       | `circle`, `rect`, `cabana`, `stool`              | Table            |
| `OrderItemStatus`  | `Queued`, `In Prep`, `Ready`, `Served`, `Voided` | OrderItem        |
| `KdsStatus`        | `Queued`, `In Prep`, `Ready`                     | KdsTicket        |
| `PaymentMethod`    | `cash`, `card`, `qr`, `room`                     | Payment          |
| `BookingStatus`    | `upcoming`, `seated`, `cancelled`                | Booking          |
| `StockStatus`      | `ok`, `low`, `critical`                          | Stock (computed) |
| `NotificationType` | `stock`, `order`, `booking`, `system`            | Notification     |
| `ShiftType`        | `Morning`, `Afternoon`, `Evening`, `Night`       | Roster           |

Use `@Enumerated(EnumType.STRING)` on entity fields so JSON matches frontend exactly.

```java
// converter/TableConverter.java
@Component
public class TableConverter {
    public TableResponse toResponse(TableEntity entity) {
        return new TableResponse(
            entity.getId(),
            entity.getLabel(),
            entity.getZoneId(),
            entity.getStatus().name().toLowerCase(),
            // ...
        );
    }
}
```

---

## 15. Base Classes & Existing Files

### `AbstractRestController`

Extend this in every controller for shared behavior (current user lookup, standard OK wrappers):

```java
@RestController
public abstract class AbstractRestController {
    protected User getCurrentUser() { /* from SecurityContext */ }
}
```

### `CorsGlobalConfig`

Update your existing `CorsGlobalConfig.java` to allow LAN origins:

```java
@Configuration
public class CorsGlobalConfig implements WebMvcConfigurer {
    @Value("${posapi.cors.allowed-origins:}")
    private String[] allowedOrigins;

    @Value("${posapi.cors.allowed-origin-patterns:http://*:4028}")
    private String[] allowedOriginPatterns;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(allowedOrigins)
            .allowedOriginPatterns(allowedOriginPatterns)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}
```

Also allow WebSocket origin on `/ws/**` in `WebSocketConfig` with the same patterns (`http://*:4028` or `setAllowedOriginPatterns("*")` for dev).

### `GlobalExceptionHandler` (`exception/`)

Return the §4 error JSON from every `@ControllerAdvice`:

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
    return ResponseEntity.badRequest().body(new ApiErrorResponse(
        400, "Bad Request", ex.getFieldError().getDefaultMessage(),
        Instant.now().toString(), req.getRequestURI()
    ));
}
```

### `Printer/` package

Wire receipt printing from:

- `POST /payments` → print receipt after successful payment
- `POST /config/printer/test` → test connection via `ReceiptPrinterService`
- `POST /zones/{zoneId}/printers/{printerId}/test` → zone-specific printer test

---

## Implementation Priority (Recommended Order)

| Phase | Modules                          | Endpoints | Why                     |
| ----- | -------------------------------- | --------- | ----------------------- |
| **1** | Auth, Staff, Users, Config       | 21        | Login + RBAC foundation |
| **2** | Zones, Tables, Menu              | 20        | Floor map loads         |
| **3** | Orders, KDS, Payments            | 14        | Core POS workflow       |
| **4** | Shifts, Dashboard, Notifications | 17        | Operations              |
| **5** | Bookings, Stock, Roster          | 29        | Extended features       |
| **6** | Analytics, WebSocket             | 6+        | Reporting & real-time   |

**Minimum viable POS (Phase 1–3):** 55 endpoints — enough for login, floor map, ordering, KDS, and payments.

---

_SkyBar POS · Backend API Specification v2.0 · Aligned with `com.posapi` + frontend `client.ts`_  
_Reference: `src/lib/api/client.ts`, `src/lib/api/types.ts`, `API_WIRING.md`_
