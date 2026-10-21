# Frontend: Food / Drink sales on reports

Payments and grand totals are correct; **food vs drink** needs **category** on each order line and/or **stored subtotals** on the payment.

---

## A. Close order — `POST /api/payments`

Optional (server **computes from order lines** when omitted):

```json
{
  "tableId": "table-v1",
  "guestCount": 4,
  "method": "card",
  "subtotal": 100,
  "serviceCharge": 10,
  "vat": 0,
  "total": 110,
  "foodSubtotal": 40,
  "drinkSubtotal": 60
}
```

**Backend behavior**

1. Loads non-void `order_items` for the active order.
2. Splits line totals (`qty × unitPrice`) by each line’s **`categoryType`** (`food` | `drink`).
3. Saves **`foodSubtotal`** and **`drinkSubtotal`** on the **`payments`** row.
4. If client sends `foodSubtotal` / `drinkSubtotal` and server compute is **0** (legacy lines), client values are stored.

Same optional fields on **`POST /api/payments/split`** (full-check hint only; each split payment gets food/drink from **that split’s `itemIds`**).

---

## B. Analytics transaction list

```http
GET /api/analytics/transactions?range=today
```

Each row includes:

```json
{
  "id": "payment-uuid",
  "amount": 110,
  "foodSubtotal": 40,
  "drinkSubtotal": 60
}
```

---

## C. Transaction detail (report drill-down)

```http
GET /api/analytics/transactions/{paymentId}
```

Returns **`OrderDetailResponse`** with:

- **`foodSubtotal`**, **`drinkSubtotal`** (from payment or recomputed from lines)
- **`items[]`** each with:

```json
{
  "id": "oi-abc",
  "menuItemId": "menu-s1",
  "categoryId": "cocktails",
  "categoryType": "drink",
  "name": "Coca",
  "qty": 1,
  "unitPrice": 1,
  "status": "Queued",
  "notes": null,
  "size": null
}
```

| Field | Meaning |
|-------|---------|
| `id` | **Order line id** (void/PATCH use this) |
| `menuItemId` | Menu catalog id |
| `categoryId` | Menu category id |
| `categoryType` | `food` or `drink` |

---

## D. Add items — persist category on the line

```http
POST /api/orders/{tableId}/items
```

```json
{
  "staff": "u2",
  "guestCount": 2,
  "items": [
    {
      "menuItemId": "menu-s1",
      "name": "Coca",
      "qty": 1,
      "unitPrice": 1,
      "categoryId": "soft-drinks"
    }
  ]
}
```

Backend sets **`categoryId`** / **`categoryType`** on **`order_items`** from `categoryId` or **`menuItemId` → menu category**.

---

## Frontend checklist

1. **Post items** — always send real **`menuItemId`**; include **`categoryId`** when the cart has it (`MenuOverlay` → `FloorMapClient` → `ordersApi.addItems`).
2. **Pay** — optional `foodSubtotal` / `drinkSubtotal`; server recomputes and stores (client values only if server compute is 0).
3. **Reports** — prefer **`foodSubtotal` / `drinkSubtotal`** on each payment detail; fallback: sum lines by **`categoryType`** on **`items[]`** (never treat order line **`id`** as menu id).
4. **Analytics list** — use list row `foodSubtotal` / `drinkSubtotal` when detail fetch fails.

---

## Frontend wiring

| Area | Path |
|------|------|
| Report aggregation | `src/app/reports/reportDocumentHelpers.ts` |
| Pay payload | `src/components/PaymentModal.tsx` |
| Kitchen send | `src/app/components/MenuOverlay.tsx`, `FloorMapClient.tsx` |
| Types | `src/lib/api/types.ts` |

---

## Related

- Menu categories: [`FRONTEND_MENU_CATEGORY.md`](FRONTEND_MENU_CATEGORY.md)
- Open/close: [`FRONTEND_OPEN_CLOSE_ORDER.md`](FRONTEND_OPEN_CLOSE_ORDER.md)

**Note:** Old paid checks may show **$0** food/drink until lines have category data or payments were re-closed after backend backfill. New orders + payments get correct splits automatically.
