# Category Printer — frontend spec

**Category Printer** sends **kitchen / bar tickets** when staff add items (`POST /api/orders/{tableId}/items`).  
**Receipt Printer** (separate screen) prints **customer receipts** after `POST /api/payments`.

## Do not

- Call `GET /api/zones/{zoneId}/printers` (receipt only)
- Ask the user to pick a zone or “save printer to zone”
- Reuse the Receipt Printer sidebar flow

## Do

1. **List categories:** `GET /api/menu/categories`
2. **Per category `{categoryId}`:**
   - **Load (admin):** `GET /api/menu/category-printers/{categoryId}` (or alternate `GET /api/menu/categories/{categoryId}/printers`)
   - **Save:** `PUT /api/menu/categories/{categoryId}/printers`

```json
{
  "printers": [
    { "id": "ks-existing", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 },
    { "name": "Grill", "printerIp": "192.168.1.51", "printerPort": 9100 }
  ]
}
```

- Include `"id"` on existing rows; omit `id` for new printers.
- One **Save** sends the full `printers` array for that category.

3. **Optional picker:** `GET /api/kitchen-printers` — catalog only (`categoryIds[]` on each row). **Do not** use as the per-tab editor list. Admin flow: [`docs/FRONTEND_ADMIN_CATEGORY_PRINTERS.md`](docs/FRONTEND_ADMIN_CATEGORY_PRINTERS.md).

3b. **Load all tabs:** `GET /api/menu/category-printers/mappings` → `{ categoryId, categoryLabel, printers[] }[]`.

4. **UI per row:** Name, IP, Port, and **Test ×5** (TCP via `POST /api/config/printer/test`, same as Receipt Printer). Run test before Save; Save is blocked if the last test for that row was 0/5 OK.

## Order flow

After `POST /api/orders/{tableId}/items`:

- Use response **`kitchenPrintJobs`**
- WebSocket: **`/topic/print/kitchen`**
- Do **not** use `receiptPrinter` for kitchen tickets

## Receipt flow (unchanged)

`POST /api/payments` → **`receiptPrinter`** from zone receipt or venue config.

## API summary (no zone in category URLs)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/menu/categories` | Category list |
| GET | `/api/menu/category-printers/{categoryId}` | Printers for one category (admin tab) |
| GET | `/api/menu/categories/{categoryId}/printers` | Same shape (alternate) |
| PUT | `/api/menu/categories/{categoryId}/printers` | Save `{ printers: [...] }` |
| GET | `/api/kitchen-printers` | All stations (picker) |

Backend tables: `kitchen_stations`, `menu_category_kitchen_stations` (restart API after deploy).
