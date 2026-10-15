# Receipt preview — frontend spec

**Receipt preview layout is frontend-owned** (React/CSS). The API returns **data**; your component decides flex, fonts, and dashed rules on screen.

**Auto print** after pay is **separate**: the server sends **ESC/POS bytes** to **`receiptPrinter`** (zone receipt or venue default). It does **not** render your HTML preview.

## Why preview ≠ print (historical)

| Preview (browser) | Physical print (before fix) |
|-------------------|-----------------------------|
| React/CSS — name left, total right | Separate API template |
| Header → table → items → totals → payment | Payment block **before** items; **center-aligned** body |

A polished UI did **not** automatically match the XP-80 until the **server ESC/POS template** was updated to follow the same structure.

## Server print (current, after API restart)

On **`POST /api/payments`**, ESC/POS output is aligned with the preview **structure**:

- **Header/footer** centered (`receiptHeader` / `receiptFooter` from config)
- **Body left-aligned** — item **name left**, **line total right** (bold row)
- **Subline:** `2 × 22.00 · Single` (size/notes)
- **Table: VIP-03 · Edge Skyline**
- **Subtotal / Service / VAT → TOTAL** (bold)
- **Payment / Tendered / Change**
- **`currencySymbol`** from venue config

Preview can still look **richer** (CSS, 58/80mm width) than thermal output. For **pixel-perfect** match, either keep improving the server template or print from the **same HTML** on the client (print bridge).

## After Confirm Payment

1. **`POST /api/payments`** (201) → **`paymentId`**, **`receiptPrinted`**, **`receiptPrintMessage`** (when print fails).
2. **`GET /api/receipts/{paymentId}`** — line items + totals for on-screen preview (payment POST has **no** `items[]`).
3. **`GET /api/config`** (cache) — `receiptHeader`, `receiptFooter`, `currencySymbol`.

### Print status (not layout)

| Field | Meaning |
|-------|---------|
| `receiptPrinted: true` | Server sent ESC/POS to receipt printer |
| `receiptPrinted: false` | Pay succeeded; print failed — read **`receiptPrintMessage`** (IP/port/network), **not** the preview CSS |

Do **not** infer printer health from how the preview looks.

## Line items (preview component)

Each item: `name`, `qty`, `unitPrice`, optional `size` / `notes`.

- **Line total:** `qty × unitPrice` (cent-safe math — see `src/lib/receiptMoney.ts`)
- **Row 1:** name left, line total right (`tabular-nums`)
- **Row 2 (muted):** qty × unit price, size, notes

## Totals block

Use API fields: `subtotal`, `serviceCharge`, `vat`, `discount`, `total`, then `method`, `cashTendered`, `change` / `changeAmount`.

## Visual style (preview only)

- Thermal width: **~302px** (58mm) or **~576px** (80mm)
- Centered header/footer; dashed rules between sections
- Component: `src/components/ReceiptPreview.tsx`

## Admin Config → Receipt Layout

Edit header/footer; preview with **sample data** or **`GET /api/receipts/{paymentId}`** (`ReceiptLayoutReviewer`).

## API summary

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/payments` | Pay; `paymentId`, print status |
| GET | `/api/receipts/{paymentId}` | Receipt lines + totals |
| GET | `/api/config` | Header, footer, currency |

## One-line brief

> Preview = `ReceiptPreview` + `GET /api/receipts/{paymentId}` + config. Auto print = server ESC/POS to `receiptPrinter`; check `receiptPrinted` / `receiptPrintMessage` on the payment response.
