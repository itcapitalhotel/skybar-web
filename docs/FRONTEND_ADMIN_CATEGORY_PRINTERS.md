# Admin config — category kitchen printers

## Use these GET endpoints only (per category)

| Purpose | Method | URL |
|--------|--------|-----|
| Load **one** tab | `GET` | `/api/menu/category-printers/{categoryId}` |
| Load **all** tabs at once | `GET` | `/api/menu/category-printers/mappings` |
| Same shape (alternate path) | `GET` | `/api/menu/categories/{categoryId}/printers` |
| Save one tab | `PUT` | `/api/menu/categories/{categoryId}/printers` |

**Do not** use `GET /api/kitchen-printers` to fill category tabs. That is a **global catalog** (every station + `categoryIds[]`), not “printers for this category”.

---

## GET one category (recommended for admin-config)

```http
GET /api/menu/category-printers/cocktails
Authorization: Bearer <JWT>
```

**Response `200`**

```json
{
  "categoryId": "cocktails",
  "categoryLabel": "Cocktails",
  "printers": [
    {
      "id": "station-uuid",
      "name": "Bar",
      "printerIp": "172.20.15.157",
      "printerPort": 9100
    }
  ]
}
```

- **`printers`** contains **only** IPs linked to **`cocktails`**.
- Other categories are **not** included. Empty array = no printer for this category.

---

## GET all categories (optional bootstrap)

```http
GET /api/menu/category-printers/mappings
Authorization: Bearer <JWT>
```

**Response `200`**: array of the same object as above (one entry per menu category, `printers` may be `[]`).

---

## Save (active tab only)

```http
PUT /api/menu/categories/{categoryId}/printers
Content-Type: application/json

{
  "printers": [
    { "name": "Bar", "printerIp": "172.20.15.157", "printerPort": 9100 }
  ]
}
```

After save, refresh **only** that category:

```http
GET /api/menu/category-printers/{categoryId}
```

Rules:

- `{categoryId}` = selected tab id.
- Send `"printers": []` to clear this category only.
- Include **`id`** only for rows returned by **this** category’s GET.

---

## Optional: copy from existing station

```http
GET /api/kitchen-printers
```

Picker only. On save, still `PUT` to **one** `{categoryId}`.

---

## Not receipt printers

Zone **`/api/zones/{zoneId}/printers`** = guest **receipt** after payment.  
Category kitchen = **`/api/menu/category-printers/...`** and **`PUT /api/menu/categories/.../printers`**.

Restart the API after deploy.
