# Open / close order — frontend spec

Party size must use JSON **`guestCount`** everywhere (not `guests`). Persist API **`orderId`** from the server — never a client UUID.

## Open (seat + start check)

### Seat table (optional)

```http
PATCH /api/tables/{tableId}/status
```

```json
{ "status": "occupied", "guestCount": 4, "staff": "u2" }
```

### Add items (opens order if needed)

```http
POST /api/orders/{tableId}/items
```

```json
{
  "staff": "u2",
  "guestCount": 4,
  "items": [{ "menuItemId": "...", "name": "...", "qty": 1, "unitPrice": 12 }]
}
```

**Response:** `orderId` (`"1"`, `"2"`, …), `addedItems`, `kitchenPrintJobs`, …

### Reload check

```http
GET /api/orders/{tableId}
```

→ `orderId`, **`guestCount`**, `items`, totals

---

## Close (pay)

```http
POST /api/payments
```

```json
{
  "tableId": "table-v3",
  "guestCount": 4,
  "method": "card",
  "subtotal": 24,
  "serviceCharge": 2.4,
  "vat": 0,
  "total": 26.4,
  "staffId": "u2",
  "cashierId": "u2"
}
```

**Split:** `POST /api/payments/split` — same top-level **`guestCount`**.

---

## After close (admin / reports)

```http
GET /api/orders/details/{orderId}
```

→ **`guestCount`**, times, items, payments (e.g. `/api/orders/details/15`)

---

## Frontend rules

1. Always JSON **`guestCount`** on seat, add items, and pay.
2. Do not keep party size UI-only — send on each step when known.
3. Store **`orderId`** from POST add-items / GET order — use for details & reports.
4. Floor UI may still show “Guests” label; the wire field is **`guestCount`**.
