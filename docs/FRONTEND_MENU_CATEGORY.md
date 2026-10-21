# Frontend — Menu categories (`categoryType`)

Kitchen vs bar routing depends on each category’s **`categoryType`**. The backend requires it on **create**; include it on **update** when changing food vs drink.

## `categoryType`

| Value   | Meaning           |
|---------|-------------------|
| `food`  | Food / kitchen    |
| `drink` | Drinks / bar      |

Use JSON field **`categoryType`** only. **Never send `"type"`** on POST/PUT.

Spring/Jackson on `UpdateMenuCategoryRequest` throws if `"type"` is present:

`InvalidDefinitionException: No fallback setter/field defined for creator property 'categoryType' … ["type"]`

The frontend client strips `type` and only sends `categoryType`.

**Do not send `null` for optional fields** (especially `sortOrder`) — omit the key instead; `"sortOrder": null` can also cause **500** on PUT.

### Backend (optional hardening)

If mobile or other clients still send `type`, add `@JsonAlias("type")` on the `categoryType` creator property, or `@JsonIgnoreProperties(ignoreUnknown = true)` on the request DTO.

---

## GET list

```http
GET /api/menu/categories
Authorization: Bearer <JWT>
```

```json
[
  {
    "id": "cocktails",
    "label": "Cocktails",
    "icon": "🍸",
    "sortOrder": 0,
    "isActive": true,
    "categoryType": "drink"
  }
]
```

## GET one

```http
GET /api/menu/categories/{categoryId}
```

Same object shape as one list item.

---

## POST create (Admin, Manager)

```http
POST /api/menu/categories
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "id": "bar-snacks",
  "label": "Bar Snacks",
  "icon": "🥨",
  "sortOrder": 5,
  "isActive": true,
  "categoryType": "food"
}
```

| Field | Required |
|--------|----------|
| `label` | yes |
| `categoryType` | yes (`food` \| `drink`) |
| `id`, `icon`, `sortOrder`, `isActive` | optional |

**Response `201`** — same fields including `categoryType`.

---

## PUT update (Admin, Manager)

```http
PUT /api/menu/categories/{categoryId}
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "label": "Snacks",
  "categoryType": "food",
  "sortOrder": 6,
  "isActive": true
}
```

All body fields optional; include `categoryType` when changing food vs drink.

**Response `200`** — full category object with `categoryType`.

---

## DELETE (Admin only)

```http
DELETE /api/menu/categories/{categoryId}
```

**Response `204`** — no body.

---

## Frontend wiring

| Screen | Path |
|--------|------|
| Categories CRUD | `src/app/menu-categories/page.tsx` — create/edit require **Category type** |
| Post items | `src/app/post-items/page.tsx` — category picker shows type; quick-add category sends `categoryType` |
| API client | `src/lib/api/client.ts` — `menuCategoryApi` |
| Types | `src/lib/api/types.ts` — `MenuCategory`, `MenuCategoryType` |
