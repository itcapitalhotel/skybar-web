'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, CheckCircle2, ChevronDown, ChevronRight, Server, Database, Lock, Globe } from 'lucide-react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestBody?: string;
  response: string;
  auth?: string;
}

interface Section {
  id: string;
  title: string;
  moduleLabel: string;
  icon: string;
  color: string;
  description: string;
  endpoints: Endpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  POST: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  PATCH: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DELETE: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const API_SECTIONS: Section[] = [
  {
    id: 'auth',
    title: 'Authentication & Session',
    moduleLabel: 'Auth API',
    icon: '🔐',
    color: '#f59e0b',
    description: 'Staff login, PIN unlock, role-based access, terminal lock/unlock.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Staff login with email and password. Returns JWT token and role.',
        requestBody: `{
  "email": "alex@skybar.com",
  "password": "string"
}`,
        response: `{
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
}`,
        auth: 'None',
      },
      {
        method: 'POST',
        path: '/api/auth/logout',
        description: 'Invalidate current session token.',
        response: `{ "message": "Logged out successfully" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/auth/refresh',
        description: 'Refresh JWT using refresh token.',
        requestBody: `{ "refreshToken": "string" }`,
        response: `{ "token": "string", "refreshToken": "string" }`,
        auth: 'None',
      },
      {
        method: 'POST',
        path: '/api/auth/manager-pin/verify',
        description: 'Verify manager PIN for privileged actions (void, discount, edit mode).',
        requestBody: `{ "pin": "1234", "action": "VOID_ITEM" }`,
        response: `{ "approved": true, "approvedBy": "Casey Wong", "role": "Manager" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/auth/me',
        description: 'Get current authenticated user profile.',
        response: `{
  "id": "u1",
  "name": "Alex Miller",
  "role": "Admin",
  "terminalId": "POS-01",
  "status": "on_shift"
}`,
        auth: 'Bearer Token',
      },
    ],
  },
  {
    id: 'tables',
    title: 'Floor Map & Tables',
    moduleLabel: 'Floor Map API',
    icon: '🗺️',
    color: '#06b6d4',
    description: 'Table CRUD, status updates, position saving, floor canvas management.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/tables',
        description: 'Get all tables with current status, guests, order totals. Optionally filter by zone.',
        response: `[
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
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/tables/{tableId}',
        description: 'Get single table details by ID.',
        response: `{
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
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/tables',
        description: 'Create a new table on the floor map.',
        requestBody: `{
  "label": "V7",
  "zone": "vip",
  "capacity": 6,
  "shape": "circle",
  "x": 500,
  "y": 300,
  "minSpend": 500
}`,
        response: `{
  "id": "table-v7",
  "label": "V7",
  "zone": "vip",
  "status": "available",
  "capacity": 6,
  "shape": "circle",
  "x": 500,
  "y": 300
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PUT',
        path: '/api/tables/{tableId}',
        description: 'Update table properties (label, capacity, shape, minSpend).',
        requestBody: `{
  "label": "V7",
  "capacity": 8,
  "minSpend": 600,
  "shape": "rect"
}`,
        response: `{ "id": "table-v7", "label": "V7", "capacity": 8 }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'DELETE',
        path: '/api/tables/{tableId}',
        description: 'Delete a table from the floor map.',
        response: `{ "message": "Table deleted" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/tables/{tableId}/status',
        description: 'Update table status (available, occupied, reserved, bill).',
        requestBody: `{
  "status": "occupied",
  "guests": 4,
  "staff": "Jordan"
}`,
        response: `{ "id": "table-v1", "status": "occupied", "guests": 4 }`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/tables/{tableId}/position',
        description: 'Save table canvas position after drag-and-drop in edit mode.',
        requestBody: `{ "x": 120, "y": 200 }`,
        response: `{ "id": "table-v1", "x": 120, "y": 200 }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'POST',
        path: '/api/tables/merge',
        description: 'Merge two tables — combine orders into one bill.',
        requestBody: `{
  "sourceTableId": "table-v1",
  "targetTableId": "table-v2"
}`,
        response: `{
  "mergedTableId": "table-v1",
  "message": "Tables merged successfully",
  "combinedOrderTotal": 601
}`,
        auth: 'Bearer Token (Manager)',
      },
      {
        method: 'POST',
        path: '/api/tables/transfer',
        description:
          'Move an open check to an empty table (floor map Change table). Source must have an active order; target must have no active order — otherwise 400 (use merge if both occupied). Optional itemIds[] for partial transfer; omit or [] = whole check. Persists table_transfer_events.',
        requestBody: `{
  "sourceTableId": "table-v1",
  "targetTableId": "table-v5",
  "staffId": "u2",
  "itemIds": null
}`,
        response: `{
  "sourceTableId": "table-v1",
  "targetTableId": "table-v5",
  "message": "Order transferred",
  "orderTotal": 452.79
}`,
        auth: 'Bearer Token (Bartender+; manager PIN on UI when required)',
      },
      {
        method: 'PATCH',
        path: '/api/tables/layout',
        description: 'Batch-save table canvas positions after edit mode (multiple tables in one request).',
        requestBody: `{
  "updates": [
    { "id": "table-v1", "x": 120, "y": 200 },
    { "id": "table-v2", "x": 280, "y": 200 }
  ]
}`,
        response: `[ { "id": "table-v1", "x": 120, "y": 200 }, ... ]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
  {
    id: 'zones',
    title: 'Zone Management',
    moduleLabel: 'Zone Management API',
    icon: '🗂️',
    color: '#10b981',
    description: 'Create, update, delete floor zones. Configure canvas dimensions and zone metadata.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/zones',
        description: 'Get all zones with table counts and capacity.',
        response: `[
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
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/zones',
        description: 'Create a new zone.',
        requestBody: `{
  "label": "Rooftop Bar",
  "description": "New outdoor section",
  "color": "#3b82f6",
  "canvasWidth": 900,
  "canvasHeight": 600
}`,
        response: `{
  "id": "zone-1234567890",
  "label": "Rooftop Bar",
  "isActive": true,
  "tableCount": 0,
  "capacity": 0
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/zones/{zoneId}',
        description: 'Update zone details.',
        requestBody: `{
  "label": "VIP Skyline",
  "description": "Updated description",
  "color": "#f59e0b",
  "canvasWidth": 1000,
  "canvasHeight": 700
}`,
        response: `{ "id": "vip", "label": "VIP Skyline" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'DELETE',
        path: '/api/zones/{zoneId}',
        description: 'Delete a zone (only if no active tables).',
        response: `{ "message": "Zone deleted" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/zones/{zoneId}/toggle',
        description: 'Toggle zone active/inactive status.',
        response: `{ "id": "vip", "isActive": false }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'GET',
        path: '/api/zones/{zoneId}/printers',
        description: 'Get all printers assigned to a zone.',
        response: `[
  {
    "id": "zp-001",
    "zoneId": "vip",
    "name": "VIP Bar Printer",
    "printerIp": "192.168.1.101",
    "printerPort": 9100,
    "isDefault": true
  },
  {
    "id": "zp-002",
    "zoneId": "vip",
    "name": "VIP Receipt Printer",
    "printerIp": "192.168.1.102",
    "printerPort": 9100,
    "isDefault": false
  }
]`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/zones/{zoneId}/printers',
        description:
          'Add a printer to a zone. **printerIp** and **printerPort** are required (400 if blank/invalid). Admin Config UI creates a draft row locally, then POSTs after a valid IPv4 is entered. Setting **isDefault: true** clears default on other printers in the zone.',
        requestBody: `{
  "name": "VIP Bar Printer",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "isDefault": false
}`,
        response: `{
  "id": "zp-001",
  "zoneId": "vip",
  "name": "VIP Bar Printer",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "isDefault": false
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/zones/{zoneId}/printers/{printerId}',
        description: 'Update a zone printer\'s name, IP, port, or default flag.',
        requestBody: `{
  "name": "VIP Bar Printer (Updated)",
  "printerIp": "192.168.1.105",
  "printerPort": 9100,
  "isDefault": true
}`,
        response: `{
  "id": "zp-001",
  "zoneId": "vip",
  "name": "VIP Bar Printer (Updated)",
  "printerIp": "192.168.1.105",
  "printerPort": 9100,
  "isDefault": true
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'DELETE',
        path: '/api/zones/{zoneId}/printers/{printerId}',
        description: 'Remove a printer from a zone.',
        response: `{ "message": "Printer removed from zone" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/zones/{zoneId}/printers/{printerId}/test',
        description:
          'TCP test for the saved zone_printers row (same **PrinterTestResponse** as config test). **Front-end (today):** Admin Config zone **Test ×5** calls **POST /api/config/printer/test** with form IP/port after PUT save — not this route — until backend implements real socket checks here.',
        response: `{
  "connected": true,
  "latencyMs": 42,
  "printerId": "zp-001",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "message": "Printer reachable at 192.168.1.101:9100"
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'GET',
        path: '/api/kitchen-printers',
        description:
          'Kitchen station catalog for “Copy existing” picker only — includes categoryIds[]. Not the per-category tab list.',
        response: `[ { "id": "ks-001", "name": "Bar Kitchen", "printerIp": "192.168.1.50", "printerPort": 9100, "categoryIds": ["cocktails"] } ]`,
        auth: 'Bearer Token (Admin)',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    moduleLabel: 'Order API',
    icon: '🧾',
    color: '#a855f7',
    description: 'Create orders, add/remove items, void items, update item status.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/orders',
        description: 'Get all active orders. Filter by tableId or status.',
        response: `[
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
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/orders/{tableId}',
        description: 'Get order items for a specific table.',
        response: `{
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
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/orders/{tableId}/items',
        description:
          'Add item(s) to a table order. Creates KDS ticket. Returns kitchenPrintJobs (WebSocket /topic/print/kitchen). Not receiptPrinter. staff = user id (e.g. u2).',
        requestBody: `{
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
  "staff": "u2"
}`,
        response: `{
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
      "lines": [{ "name": "Don Julio 1942", "qty": 1, "size": "Shot", "unitPrice": 48 }]
    }
  ]
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/orders/{tableId}/items/{itemId}/void',
        description: 'Void a specific order item. Requires manager PIN approval.',
        requestBody: `{
  "reason": "Customer changed mind",
  "managerApproval": "pin-token-xyz"
}`,
        response: `{ "id": "item-001", "status": "Voided" }`,
        auth: 'Bearer Token (Manager PIN required)',
      },
      {
        method: 'GET',
        path: '/api/orders/details/{orderId}',
        description:
          'Full order detail for Reports eye icon and analytics payment drill-down. Same shape as GET /api/analytics/transactions/{paymentId} when linked by orderId. Includes items, payments, openedAt/closedAt, hasMerge/hasSplit, merges[], splits[], transfers[].',
        response: `{
  "orderId": "ord-table-v3-20261009",
  "tableId": "table-v3",
  "tableLabel": "V3",
  "zoneLabel": "VIP Edge Skyline",
  "covers": 4,
  "openedAt": "2026-10-09T17:05:00Z",
  "closedAt": "2026-10-09T19:47:00Z",
  "staffId": "u2",
  "staffName": "Jordan Lee",
  "subtotal": 66.0,
  "serviceCharge": 6.6,
  "vat": 7.26,
  "total": 79.86,
  "items": [ { "id": "item-1", "name": "Signature Cocktail", "qty": 2, "unitPrice": 28, "status": "Served" } ],
  "payments": [ { "paymentId": "pay-001", "method": "card", "amount": 79.86, "guestLabel": "Guest 1", "closedAt": "2026-10-09T19:47:00Z" } ],
  "hasMerge": false,
  "hasSplit": true,
  "merges": [],
  "splits": [ { "splitCount": 2, "total": 79.86, "paymentIds": ["pay-001", "pay-002"] } ],
  "hasTransfer": false,
  "transfers": []
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'DELETE',
        path: '/api/orders/{tableId}',
        description: 'Clear all items from a table order (after payment).',
        response: `{ "message": "Order cleared for table-v1" }`,
        auth: 'Bearer Token',
      },
    ],
  },
  {
    id: 'menu',
    title: 'Menu Items',
    moduleLabel: 'Menu API',
    icon: '🍸',
    color: '#ec4899',
    description: 'Menu catalog management — categories, items, sizes, pricing.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/menu',
        description: 'Get full menu with all categories and items.',
        response: `[
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
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/menu/categories',
        description: 'Get list of all menu categories.',
        response: `["Cocktails", "Spirits", "Wine & Bubbles", "Beer", "Bites", "Hookah"]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/menu/category-printers/mappings',
        description:
          'All category → kitchen printer mappings for Admin Config (one list per category). Do not use GET /kitchen-printers as the tab editor list.',
        response: `[ { "categoryId": "cocktails", "categoryLabel": "Cocktails", "printers": [ { "id": "ks-001", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 } ] } ]`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'GET',
        path: '/api/menu/category-printers/{categoryId}',
        description:
          'Preferred Admin tab load — printers linked to this category only (wrapped object, use response.printers).',
        response: `{ "categoryId": "cocktails", "categoryLabel": "Cocktails", "printers": [ { "id": "ks-001", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 } ] }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'GET',
        path: '/api/menu/categories/{categoryId}/printers',
        description: 'Alternate path — same wrapped shape as GET /menu/category-printers/{categoryId}.',
        response: `{ "categoryId": "cocktails", "printers": [ { "id": "ks-001", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 } ] }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/menu/categories/{categoryId}/printers',
        description: 'Save full printers array for category (name, IP, port; id optional on new rows).',
        requestBody: `{ "printers": [ { "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 } ] }`,
        response: `{ "categoryId": "cocktails", "printers": [ { "id": "ks-001", "name": "Bar", "printerIp": "192.168.1.50", "printerPort": 9100 } ] }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/menu',
        description: 'Create a new menu item.',
        requestBody: `{
  "name": "New Cocktail",
  "category": "Cocktails",
  "image": "https://...",
  "description": "Description here",
  "sizes": [{ "label": "Single", "price": 20 }],
  "popular": false
}`,
        response: `{ "id": "menu-c99", "name": "New Cocktail", "available": true }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PUT',
        path: '/api/menu/{menuItemId}',
        description: 'Update a menu item.',
        requestBody: `{
  "name": "Updated Name",
  "sizes": [{ "label": "Single", "price": 25 }],
  "popular": true
}`,
        response: `{ "id": "menu-c1", "name": "Updated Name" }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'DELETE',
        path: '/api/menu/{menuItemId}',
        description: 'Delete a menu item.',
        response: `{ "message": "Menu item deleted" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/menu/{menuItemId}/availability',
        description: 'Toggle item availability (86\'d / back in stock).',
        requestBody: `{ "available": false }`,
        response: `{ "id": "menu-c1", "available": false }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
  {
    id: 'kds',
    title: 'KDS — Kitchen Display System',
    moduleLabel: 'KDS API',
    icon: '👨‍🍳',
    color: '#f97316',
    description: 'KDS ticket management — queue, advance status, recall, mark served.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/kds/tickets',
        description: 'Get all active KDS tickets. Filter by status (Queued, In Prep, Ready).',
        response: `[
  {
    "id": "kds-001",
    "tableLabel": "V1",
    "zone": "VIP",
    "status": "In Prep",
    "queuedAt": 8,
    "staff": "Alex",
    "items": [
      { "id": "ki-001", "name": "Don Julio 1942", "qty": 2 }
    ]
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/kds/tickets/{ticketId}/advance',
        description: 'Advance ticket status: Queued → In Prep → Ready → (served/removed).',
        response: `{ "id": "kds-001", "status": "Ready" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/kds/tickets/{ticketId}/recall',
        description: 'Recall ticket to previous status (Ready → In Prep → Queued).',
        response: `{ "id": "kds-001", "status": "In Prep" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'DELETE',
        path: '/api/kds/tickets/{ticketId}',
        description: 'Remove a ticket from KDS (after served).',
        response: `{ "message": "Ticket removed" }`,
        auth: 'Bearer Token',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    moduleLabel: 'Payment API',
    icon: '💳',
    color: '#06b6d4',
    description: 'Process payments, split bills, apply discounts, generate receipts.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/payments',
        description:
          'Process a payment for a table. Clears order; auto-prints ESC/POS to receiptPrinter. Check receiptPrinted / receiptPrintMessage — not HTML preview. Front-end: docs/FRONTEND_RECEIPT_PREVIEW.md.',
        requestBody: `{
  "tableId": "table-v1",
  "method": "card",
  "subtotal": 387.00,
  "serviceCharge": 38.70,
  "vat": 27.09,
  "total": 452.79,
  "cashTendered": null,
  "roomNumber": null,
  "discount": 0
}`,
        response: `{
  "paymentId": "pay-001",
  "tableId": "table-v1",
  "method": "card",
  "total": 452.79,
  "change": 0,
  "receiptUrl": "/api/receipts/pay-001",
  "receiptPrinted": true,
  "receiptPrintMessage": null,
  "timestamp": "2026-07-24T20:30:00Z"
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/payments/split',
        description:
          'Split bill (Equal / By $ / By item in SplitBillModal). **≥2 splits**. Each split: **guestLabel**, non-empty **itemIds[]** (every non-void order line exactly once), **method**, **amount** (final $; SC/VAT often 0 on split rows). **sum(amount)** within ±0.02 of order **total** from GET /orders/{tableId}. Optional **staffId** / **cashierId**. HTTP 200 closes order, frees table, creates payment_splits + bill_split_events.',
        requestBody: `{
  "tableId": "table-v1",
  "staffId": "u2",
  "cashierId": "u2",
  "splits": [
    {
      "guestLabel": "Guest 1",
      "itemIds": ["oi-abc", "oi-def"],
      "method": "card",
      "amount": 96.00
    },
    {
      "guestLabel": "Guest 2",
      "itemIds": ["oi-ghi"],
      "method": "cash",
      "amount": 48.00,
      "cashTendered": 50.00
    }
  ]
}`,
        response: `{
  "orderId": "ord-001",
  "splitEventId": "bse-001",
  "splitPayments": [
    { "paymentId": "pay-001a", "guestLabel": "Guest 1", "amount": 96.00, "method": "card", "closedAt": "2026-07-24T20:30:00Z" },
    { "paymentId": "pay-001b", "guestLabel": "Guest 2", "amount": 48.00, "method": "cash", "closedAt": "2026-07-24T20:30:05Z" }
  ]
}`,
        auth: 'Bearer Token (Cashier/Manager/Admin)',
      },
      {
        method: 'GET',
        path: '/api/receipts/{paymentId}',
        description: 'Get receipt data for a completed payment.',
        response: `{
  "paymentId": "pay-001",
  "tableId": "table-v1",
  "items": [...],
  "subtotal": 387.00,
  "serviceCharge": 38.70,
  "vat": 27.09,
  "total": 452.79,
  "method": "card",
  "timestamp": "2026-07-24T20:30:00Z",
  "receiptHeader": "SkyBar Rooftop Lounge",
  "receiptFooter": "Thank you for visiting SkyBar!"
}`,
        auth: 'Bearer Token',
      },
    ],
  },
  {
    id: 'bookings',
    title: 'Table Bookings',
    moduleLabel: 'Booking API',
    icon: '📅',
    color: '#06b6d4',
    description: 'Reservation management — create, update, seat, cancel bookings with zone preference, party size, notes, and 15-min reminder alerts.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/bookings',
        description: 'Get all bookings. Filter by date, zone, status, or date range.',
        response: `[
  {
    "id": "bk-001",
    "tableId": "table-v3",
    "guestName": "James Thornton",
    "phone": "+1 555-0192",
    "notes": "Birthday celebration, please arrange cake",
    "partySize": 8,
    "date": "2026-07-24",
    "time": "20:00",
    "status": "upcoming",
    "zonePreference": "vip",
    "reminderEnabled": true,
    "createdAt": "2026-07-24T14:30:00Z"
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/bookings',
        description: 'Create a new table booking with zone preference and 15-min reminder flag.',
        requestBody: `{
  "tableId": "table-v3",
  "guestName": "James Thornton",
  "phone": "+1 555-0192",
  "notes": "Birthday celebration, champagne on arrival",
  "partySize": 8,
  "date": "2026-07-24",
  "time": "20:00",
  "zonePreference": "vip",
  "reminderEnabled": true
}`,
        response: `{
  "id": "bk-001",
  "tableId": "table-v3",
  "guestName": "James Thornton",
  "partySize": 8,
  "zonePreference": "vip",
  "reminderEnabled": true,
  "status": "upcoming",
  "createdAt": "2026-07-24T14:30:00Z"
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'PUT',
        path: '/api/bookings/{bookingId}',
        description: 'Update booking details including party size, zone preference, notes, and reminder toggle.',
        requestBody: `{
  "tableId": "table-v3",
  "guestName": "James Thornton",
  "phone": "+1 555-0192",
  "notes": "Updated — VIP treatment required",
  "partySize": 10,
  "date": "2026-07-24",
  "time": "21:00",
  "zonePreference": "vip",
  "reminderEnabled": true
}`,
        response: `{
  "id": "bk-001",
  "partySize": 10,
  "time": "21:00",
  "zonePreference": "vip",
  "reminderEnabled": true
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/bookings/{bookingId}/seat',
        description: 'Mark booking as seated — updates table status to occupied.',
        response: `{ "id": "bk-001", "status": "seated" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/bookings/{bookingId}/cancel',
        description: 'Cancel a booking.',
        response: `{ "id": "bk-001", "status": "cancelled" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'DELETE',
        path: '/api/bookings/{bookingId}',
        description: 'Delete a booking record.',
        response: `{ "message": "Booking deleted" }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/bookings/reminders/upcoming',
        description: 'Get bookings arriving within the next 15 minutes (used by scheduler to broadcast reminders).',
        response: `[
  {
    "id": "bk-001",
    "guestName": "James Thornton",
    "tableLabel": "V3",
    "zone": "VIP Edge Skyline",
    "arrivalTime": "20:00",
    "partySize": 8,
    "minutesUntilArrival": 14
  }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'POST',
        path: '/api/bookings/{bookingId}/reminder/test',
        description: 'Manually trigger a 15-min reminder broadcast for a specific booking (for testing).',
        response: `{ "message": "Reminder broadcast sent", "bookingId": "bk-001", "topic": "/topic/bookings/reminders" }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
  {
    id: 'roster',
    title: 'Weekly Roster & Staff Shifts',
    moduleLabel: 'Roster API',
    icon: '📋',
    color: '#a855f7',
    description: 'Staff shift scheduling — weekly grid, zone assignments, shift start/end times, availability management, and KDS station sync.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/roster/shifts',
        description: 'Get all shifts. Filter by week (weekStart=YYYY-MM-DD), staffId, or zoneId.',
        response: `[
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
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'POST',
        path: '/api/roster/shifts',
        description: 'Create a new staff shift with zone assignment and optional KDS sync.',
        requestBody: `{
  "staffId": "u2",
  "date": "2026-08-04",
  "startTime": "18:00",
  "endTime": "02:00",
  "zoneId": "bar",
  "shiftType": "Night",
  "kdsAssigned": true,
  "notes": "Cover for Sam"
}`,
        response: `{
  "id": "sh-10",
  "staffId": "u2",
  "staffName": "Jordan Lee",
  "date": "2026-08-04",
  "startTime": "18:00",
  "endTime": "02:00",
  "zoneId": "bar",
  "shiftType": "Night",
  "kdsAssigned": true
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PUT',
        path: '/api/roster/shifts/{shiftId}',
        description: 'Update a shift — change zone, times, shift type, or KDS assignment.',
        requestBody: `{
  "startTime": "19:00",
  "endTime": "03:00",
  "zoneId": "vip",
  "shiftType": "Night",
  "kdsAssigned": false,
  "notes": "Moved to VIP section"
}`,
        response: `{ "id": "sh-1", "zoneId": "vip", "startTime": "19:00", "kdsAssigned": false }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'DELETE',
        path: '/api/roster/shifts/{shiftId}',
        description: 'Delete a shift from the roster.',
        response: `{ "message": "Shift deleted" }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/roster/availability',
        description: 'Get weekly availability for all staff members.',
        response: `[
  {
    "staffId": "u1",
    "staffName": "Alex Miller",
    "role": "Admin",
    "preferredZone": "vip",
    "kdsStation": "KDS-1",
    "weeklyAvailability": {
      "Mon": "available",
      "Tue": "available",
      "Wed": "available",
      "Thu": "available",
      "Fri": "available",
      "Sat": "partial",
      "Sun": "unavailable"
    }
  }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PUT',
        path: '/api/roster/availability/{staffId}',
        description: 'Update a staff member\'s weekly availability and KDS station assignment.',
        requestBody: `{
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
}`,
        response: `{
  "staffId": "u2",
  "staffName": "Jordan Lee",
  "weeklyAvailability": { "Mon": "available", "Tue": "available", "Wed": "partial" },
  "kdsStation": "KDS-2"
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/roster/kds-assignments',
        description: 'Get all staff currently assigned to KDS stations — used to sync KDS board with active staff.',
        response: `[
  { "staffId": "u1", "staffName": "Alex Miller", "kdsStation": "KDS-1", "zone": "vip" },
  { "staffId": "u2", "staffName": "Jordan Lee",  "kdsStation": "KDS-2", "zone": "bar" },
  { "staffId": "u6", "staffName": "Taylor Quinn","kdsStation": "KDS-3", "zone": "cabana" }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/roster/shifts/{shiftId}/kds',
        description: 'Toggle KDS assignment for a specific shift — syncs to KDS board in real time.',
        requestBody: `{ "kdsAssigned": true }`,
        response: `{ "id": "sh-1", "kdsAssigned": true, "kdsStation": "KDS-1" }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
  {
    id: 'users',
    title: 'User Management',
    moduleLabel: 'User Management API',
    icon: '👥',
    color: '#a855f7',
    description: 'Staff account management — CRUD, role assignment, status toggle.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/users',
        description: 'Get all staff users. Filter by role or status.',
        response: `[
  {
    "id": "u1",
    "name": "Alex Miller",
    "email": "alex@skybar.com",
    "role": "Admin",
    "status": "on_shift",
    "terminalId": "POS-01",
    "avatar": "AM",
    "joinDate": "2023-01-15",
    "lastActive": "2 min ago",
    "shiftsThisWeek": 5
  }
]`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/users',
        description: 'Create a new staff account.',
        requestBody: `{
  "name": "New Staff",
  "email": "staff@skybar.com",
  "role": "Bartender",
  "terminalId": "POS-05",
  "password": "initialPassword123"
}`,
        response: `{
  "id": "u7",
  "name": "New Staff",
  "email": "staff@skybar.com",
  "role": "Bartender",
  "status": "inactive"
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/users/{userId}',
        description: 'Update staff account details.',
        requestBody: `{
  "name": "Updated Name",
  "email": "updated@skybar.com",
  "role": "Manager",
  "terminalId": "POS-02"
}`,
        response: `{ "id": "u1", "name": "Updated Name", "role": "Manager" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'DELETE',
        path: '/api/users/{userId}',
        description: 'Delete a staff account.',
        response: `{ "message": "User deleted" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/users/{userId}/status',
        description: 'Toggle user status between active and inactive.',
        requestBody: `{ "status": "active" }`,
        response: `{ "id": "u5", "status": "active" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/users/{userId}/password',
        description: 'Reset or change staff password.',
        requestBody: `{ "newPassword": "newSecurePassword123" }`,
        response: `{ "message": "Password updated" }`,
        auth: 'Bearer Token (Admin)',
      },
    ],
  },
  {
    id: 'shift',
    title: 'Shift & Cash Management',
    moduleLabel: 'Shift & Cash API',
    icon: '💰',
    color: '#10b981',
    description: 'Shift open/close, cash drawer reconciliation, transaction history, end-of-shift reports.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/shifts/current',
        description: 'Get current active shift data.',
        response: `{
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
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/shifts/open',
        description: 'Open a new shift with opening float.',
        requestBody: `{
  "cashierId": "u1",
  "openingFloat": 500,
  "terminalId": "POS-01"
}`,
        response: `{
  "shiftId": "SH-2026-0724-01",
  "openedAt": "2026-07-24T18:00:00Z",
  "cashier": "Alex Miller"
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'POST',
        path: '/api/shifts/close',
        description: 'Close the current shift and generate end-of-shift report.',
        requestBody: `{
  "countedCash": 1720,
  "notes": "Busy Friday night"
}`,
        response: `{
  "shiftId": "SH-2026-0724-01",
  "closedAt": "2026-07-24T02:00:00Z",
  "totalRevenue": 6210,
  "cashVariance": -20,
  "reportUrl": "/api/shifts/SH-2026-0724-01/report"
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/shifts/{shiftId}/transactions',
        description: 'Get all transactions for a shift.',
        response: `[
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
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/shifts/drawer/reconcile',
        description: 'Submit cash drawer count for reconciliation.',
        requestBody: `{
  "shiftId": "SH-2026-0724-01",
  "denominations": {
    "100": 5,
    "50": 8,
    "20": 12,
    "10": 15,
    "5": 20,
    "1": 30,
    "coins": 4.50
  },
  "countedTotal": 1724.50
}`,
        response: `{
  "expectedCash": 1740,
  "countedCash": 1724.50,
  "variance": -15.50,
  "status": "short"
}`,
        auth: 'Bearer Token',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Manager Dashboard',
    moduleLabel: 'Dashboard API',
    icon: '📊',
    color: '#a855f7',
    description: 'Real-time analytics — zone revenue, top items, payment breakdown, hourly data.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/dashboard/summary',
        description: 'Get shift KPI summary — total revenue, guests, avg spend, active tables.',
        response: `{
  "shiftRevenue": 8650,
  "totalGuests": 78,
  "avgSpend": 110,
  "activeTables": 12,
  "tablesAwaitingBill": 4,
  "lastUpdated": "2026-07-24T22:15:00Z"
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/dashboard/zone-revenue',
        description: 'Get revenue breakdown by zone for current shift.',
        response: `[
  {
    "zone": "VIP Edge",
    "revenue": 2840,
    "guests": 18,
    "tables": 6,
    "color": "#f59e0b"
  }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/dashboard/top-items',
        description: 'Get top selling items by revenue for current shift.',
        response: `[
  {
    "name": "Don Julio 1942",
    "category": "Spirits",
    "qty": 14,
    "revenue": 672,
    "trend": "up"
  }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/dashboard/payment-breakdown',
        description: 'Get payment method breakdown for current shift.',
        response: `[
  { "name": "Card", "value": 3870 },
  { "name": "Cash", "value": 1240 },
  { "name": "QR", "value": 620 },
  { "name": "Room Charge", "value": 480 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/dashboard/hourly-revenue',
        description: 'Get hourly revenue breakdown by zone.',
        response: `[
  { "hour": "6PM", "vip": 120, "bar": 80, "terrace": 40, "cabana": 200 },
  { "hour": "7PM", "vip": 280, "bar": 160, "terrace": 90, "cabana": 380 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
  {
    id: 'config',
    title: 'Admin Configuration',
    moduleLabel: 'Admin Config API',
    icon: '⚙️',
    color: '#f43f5e',
    description: 'Venue-level settings — service charge, VAT, currency, printer, house rules, receipt layout.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/config',
        description: 'Get current venue configuration.',
        response: `{
  "serviceCharge": 10,
  "vatRate": 7,
  "currency": "USD",
  "currencySymbol": "$",
  "printerIp": "192.168.1.100",
  "printerPort": 9100,
  "houseRules": "Welcome to SkyBar...",
  "receiptHeader": "SkyBar Rooftop Lounge\\nLevel 32, Skyline Tower",
  "receiptFooter": "Thank you for visiting SkyBar!"
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/config',
        description: 'Update venue configuration. All fields optional — partial updates supported.',
        requestBody: `{
  "serviceCharge": 12,
  "vatRate": 7,
  "currency": "THB",
  "currencySymbol": "฿",
  "printerIp": "192.168.1.101",
  "printerPort": 9100,
  "houseRules": "Updated house rules...",
  "receiptHeader": "SkyBar Rooftop Lounge",
  "receiptFooter": "Thank you!"
}`,
        response: `{
  "message": "Configuration saved",
  "updatedAt": "2026-07-24T22:00:00Z"
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/config/printer/test',
        description:
          '**TCP socket** test to printerIp:printerPort (ESC/POS port 9100) — **not** ICMP ping. Set **connected: true** only after a successful connect; **connected: false** on timeout/refused/unreachable. Optional **latencyMs**. Admin Config runs this **5×** for venue default and zone printer Test dots. Do not return stub always-true.',
        requestBody: `{
  "printerIp": "192.168.1.100",
  "printerPort": 9100
}`,
        response: `{
  "connected": true,
  "latencyMs": 38,
  "printerIp": "192.168.1.100",
  "printerPort": 9100,
  "message": "Printer reachable at 192.168.1.100:9100"
}

// Failure example:
{
  "connected": false,
  "latencyMs": null,
  "printerIp": "172.19.14.1",
  "printerPort": 9100,
  "message": "Connection timed out: 172.19.14.1:9100"
}`,
        auth: 'Bearer Token (Admin)',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    moduleLabel: 'Notification API',
    icon: '🔔',
    color: '#f59e0b',
    description: 'Real-time alerts — stock warnings, order-ready flags, booking reminders, system messages.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/notifications',
        description: 'Get all notifications for the current user. Filter by type (stock, order, booking, system) or read status.',
        response: `[
  {
    "id": "notif-001",
    "type": "stock",
    "priority": "critical",
    "title": "Critical Stock: Hendrick's Gin",
    "message": "Only 1 bottle remaining — below critical threshold of 2",
    "meta": "Spirits · 1 bottle left",
    "read": false,
    "createdAt": "2026-07-24T21:45:00Z"
  },
  {
    "id": "notif-002",
    "type": "order",
    "priority": "high",
    "title": "Order Ready — Table V2",
    "message": "2 items ready for service at Table V2 (VIP Zone)",
    "meta": "Table V2 · 2 items",
    "read": false,
    "createdAt": "2026-07-24T21:50:00Z"
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/notifications/unread-count',
        description: 'Get unread notification counts grouped by type.',
        response: `{
  "total": 7,
  "stock": 3,
  "order": 2,
  "booking": 1,
  "system": 1
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/notifications/{notificationId}/read',
        description: 'Mark a single notification as read.',
        response: `{ "id": "notif-001", "read": true }`,
        auth: 'Bearer Token',
      },
      {
        method: 'PATCH',
        path: '/api/notifications/read-all',
        description: 'Mark all notifications as read for the current user.',
        response: `{ "message": "All notifications marked as read", "updatedCount": 7 }`,
        auth: 'Bearer Token',
      },
      {
        method: 'DELETE',
        path: '/api/notifications/{notificationId}',
        description: 'Dismiss (delete) a single notification.',
        response: `{ "message": "Notification dismissed" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'DELETE',
        path: '/api/notifications/clear-read',
        description: 'Clear all read notifications for the current user.',
        response: `{ "message": "Read notifications cleared", "deletedCount": 4 }`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/notifications',
        description: 'Create a system notification (triggered internally by backend events — stock threshold breach, KDS ready, booking reminder).',
        requestBody: `{
  "type": "stock",
  "priority": "critical",
  "title": "Critical Stock: Hendrick's Gin",
  "message": "Only 1 bottle remaining — below critical threshold of 2",
  "meta": "Spirits · 1 bottle left",
  "targetRoles": ["Admin", "Manager"]
}`,
        response: `{
  "id": "notif-099",
  "type": "stock",
  "priority": "critical",
  "title": "Critical Stock: Hendrick's Gin",
  "read": false,
  "createdAt": "2026-07-24T22:00:00Z"
}`,
        auth: 'Bearer Token (Admin/Manager — or internal service)',
      },
    ],
  },
  {
    id: 'realtime',
    title: 'Real-Time Events (WebSocket / SSE)',
    moduleLabel: 'Real-Time Events API',
    icon: '⚡',
    color: '#6366f1',
    description: 'Live order notifications, KDS updates, floor map changes — delivered via WebSocket (STOMP) or Server-Sent Events.',
    endpoints: [
      {
        method: 'GET',
        path: 'WS /ws/pos (STOMP handshake)',
        description: 'Establish a WebSocket connection using STOMP over SockJS. After connecting, subscribe to topic channels to receive real-time push events.',
        requestBody: `// JavaScript client setup (SockJS + STOMP)
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const client = new Client({
  webSocketFactory: () => new SockJS('/ws/pos'),
  connectHeaders: { Authorization: 'Bearer <token>' },
  onConnect: () => {
    client.subscribe('/topic/orders/new', (msg) => {
      const order = JSON.parse(msg.body);
      showOrderNotification(order);
    });
    client.subscribe('/topic/kds/updates', (msg) => {
      const update = JSON.parse(msg.body);
      refreshKDSBoard(update);
    });
    client.subscribe('/topic/tables/status', (msg) => {
      const change = JSON.parse(msg.body);
      updateFloorMap(change);
    });
  },
});
client.activate();`,
        response: `// Event payload — /topic/orders/new
{
  "event": "ORDER_CREATED",
  "tableId": "table-v1",
  "tableLabel": "Table V1",
  "zone": "VIP Zone",
  "staff": "Alex Miller",
  "staffId": "u1",
  "items": [
    { "name": "Hendrick's G&T", "qty": 2 },
    { "name": "Truffle Fries", "qty": 1 }
  ],
  "orderId": "ord-20260724-001",
  "timestamp": "2026-07-24T21:55:00Z"
}`,
        auth: 'Bearer Token (in STOMP connect headers)',
      },
      {
        method: 'GET',
        path: 'GET /api/events/orders (SSE fallback)',
        description: 'Server-Sent Events stream for environments where WebSocket is unavailable. Emits the same ORDER_CREATED events as the STOMP topic.',
        requestBody: `// SSE client setup (browser EventSource)
const source = new EventSource('/api/events/orders', { withCredentials: true });
source.addEventListener('ORDER_CREATED', (e) => {
  const order = JSON.parse(e.data);
  showOrderNotification(order);
});
source.addEventListener('KDS_UPDATE', (e) => {
  const update = JSON.parse(e.data);
  refreshKDSBoard(update);
});`,
        response: `// SSE stream format (text/event-stream)
event: ORDER_CREATED
data: {"event":"ORDER_CREATED","tableLabel":"Table V1","zone":"VIP Zone","staff":"Alex Miller","items":[{"name":"Hendrick's G&T","qty":2}],"timestamp":"2026-07-24T21:55:00Z"}

event: KDS_UPDATE
data: {"ticketId":"kds-001","tableLabel":"Table V1","status":"Ready","updatedAt":"2026-07-24T21:58:00Z"}

event: TABLE_STATUS
data: {"tableId":"table-v1","status":"occupied","guests":4,"updatedAt":"2026-07-24T21:55:00Z"}`,
        auth: 'Bearer Token (Authorization header or cookie)',
      },
      {
        method: 'POST',
        path: '/api/orders/notify',
        description: 'Manually broadcast an ORDER_CREATED event to all connected WebSocket/SSE clients. Called internally by the backend when a new order is persisted.',
        requestBody: `{
  "tableId": "table-v1",
  "tableLabel": "Table V1",
  "zone": "VIP Zone",
  "staffId": "u1",
  "items": [
    { "menuItemId": "mi-001", "name": "Hendrick's G&T", "qty": 2 },
    { "menuItemId": "mi-042", "name": "Truffle Fries", "qty": 1 }
  ]
}`,
        response: `{
  "broadcasted": true,
  "connectedClients": 3,
  "event": "ORDER_CREATED",
  "timestamp": "2026-07-24T21:55:00Z"
}`,
        auth: 'Bearer Token (Admin/Manager or internal service)',
      },
      {
        method: 'GET',
        path: 'WS /topic/kds/updates (STOMP subscription)',
        description: 'Subscribe to KDS ticket status changes in real time. Fires whenever a ticket advances (Queued → In Prep → Ready → Served).',
        response: `// Payload on /topic/kds/updates
{
  "event": "KDS_STATUS_CHANGED",
  "ticketId": "kds-001",
  "tableLabel": "Table V1",
  "zone": "VIP Zone",
  "previousStatus": "In Prep",
  "newStatus": "Ready",
  "items": [{ "name": "Hendrick's G&T", "qty": 2 }],
  "updatedAt": "2026-07-24T21:58:00Z"
}`,
        auth: 'Bearer Token (in STOMP connect headers)',
      },
      {
        method: 'GET',
        path: 'WS /topic/bookings/reminders (STOMP subscription)',
        description: 'Subscribe to reservation reminder events. The backend broadcasts a message 15 minutes before each booking\'s arrival time.',
        requestBody: `// Subscribe after STOMP CONNECTED
client.subscribe('/topic/bookings/reminders', (msg) => {
  const reminder = JSON.parse(msg.body);
  showBookingReminderNotification(reminder);
});`,
        response: `// Payload on /topic/bookings/reminders
{
  "event": "BOOKING_REMINDER",
  "bookingId": "bkg-20260724-007",
  "guestName": "Alexandra Chen",
  "tableLabel": "Table V3",
  "zone": "VIP Zone",
  "arrivalTime": "8:30 PM",
  "partySize": 4,
  "minutesUntilArrival": 15,
  "timestamp": "2026-07-24T20:15:00Z"
}`,
        auth: 'Bearer Token (in STOMP connect headers)',
      },
      {
        method: 'GET',
        path: 'WS /topic/tables/status (STOMP subscription)',
        description: 'Subscribe to floor map table status changes. Fires when a table becomes occupied, available, reserved, or moves to bill.',
        response: `// Payload on /topic/tables/status
{
  "event": "TABLE_STATUS_CHANGED",
  "tableId": "table-v1",
  "tableLabel": "Table V1",
  "zone": "VIP Zone",
  "previousStatus": "available",
  "newStatus": "occupied",
  "guests": 4,
  "updatedAt": "2026-07-24T21:55:00Z"
}`,
        auth: 'Bearer Token (in STOMP connect headers)',
      },
    ],
  },
  {
    id: 'stock',
    title: 'Stock Management',
    moduleLabel: 'Stock API',
    icon: '📦',
    color: '#10b981',
    description: 'Inventory tracking — current stock levels, reorder thresholds, low-stock alerts, usage history per item, bulk entry, and end-of-shift reconciliation.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/stock',
        description: 'Get all stock items with current levels, thresholds, and status. Filter by category or status.',
        response: `[
  {
    "id": "stock-s1",
    "name": "Don Julio 1942",
    "category": "Spirits",
    "unit": "bottles",
    "currentStock": 4,
    "reorderThreshold": 3,
    "maxStock": 12,
    "status": "ok",
    "lastUpdated": "2026-07-24T18:00:00Z",
    "updatedBy": "Alex"
  },
  {
    "id": "stock-s2",
    "name": "Hendrick's Gin",
    "category": "Spirits",
    "unit": "bottles",
    "currentStock": 1,
    "reorderThreshold": 2,
    "maxStock": 10,
    "status": "critical",
    "lastUpdated": "2026-07-24T20:00:00Z",
    "updatedBy": "Jordan"
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/stock/{stockItemId}',
        description: 'Get a single stock item by ID.',
        response: `{
  "id": "stock-s1",
  "name": "Don Julio 1942",
  "category": "Spirits",
  "unit": "bottles",
  "currentStock": 4,
  "reorderThreshold": 3,
  "maxStock": 12,
  "status": "ok",
  "lastUpdated": "2026-07-24T18:00:00Z",
  "updatedBy": "Alex"
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/stock/alerts',
        description: 'Get all stock items currently below reorder threshold (status: critical or low). Used by the low-stock alerts panel on the Stock Management screen.',
        response: `[
  {
    "id": "stock-s2",
    "name": "Hendrick's Gin",
    "category": "Spirits",
    "unit": "bottles",
    "currentStock": 1,
    "reorderThreshold": 2,
    "maxStock": 10,
    "status": "critical",
    "lastUpdated": "2026-07-24T20:00:00Z"
  },
  {
    "id": "stock-m1",
    "name": "Fever-Tree Tonic",
    "category": "Mixers",
    "unit": "cases (24)",
    "currentStock": 2,
    "reorderThreshold": 6,
    "maxStock": 18,
    "status": "low",
    "lastUpdated": "2026-07-24T19:00:00Z"
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'GET',
        path: '/api/stock/{stockItemId}/history',
        description: 'Get usage history for a single stock item — consumed, restocked, adjusted, and reconciled events. Used by the Usage History side panel. Supports optional ?limit=N and ?from=ISO&to=ISO query params.',
        response: `[
  {
    "id": "hist-001",
    "stockItemId": "stock-s1",
    "timestamp": "2026-07-24T22:15:00Z",
    "type": "consumed",
    "quantity": -2,
    "previousStock": 6,
    "newStock": 4,
    "updatedBy": "Alex",
    "note": "Evening service"
  },
  {
    "id": "hist-002",
    "stockItemId": "stock-s1",
    "timestamp": "2026-07-24T18:00:00Z",
    "type": "restocked",
    "quantity": 4,
    "previousStock": 2,
    "newStock": 6,
    "updatedBy": "Jordan",
    "note": "Delivery received"
  },
  {
    "id": "hist-003",
    "stockItemId": "stock-s1",
    "timestamp": "2026-07-23T23:00:00Z",
    "type": "consumed",
    "quantity": -3,
    "previousStock": 5,
    "newStock": 2,
    "updatedBy": "Alex",
    "note": null
  }
]`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/stock',
        description: 'Create a new stock item.',
        requestBody: `{
  "name": "Aperol",
  "category": "Liqueurs",
  "unit": "bottles",
  "currentStock": 6,
  "reorderThreshold": 3,
  "maxStock": 12
}`,
        response: `{
  "id": "stock-l99",
  "name": "Aperol",
  "category": "Liqueurs",
  "status": "ok"
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PUT',
        path: '/api/stock/{stockItemId}',
        description: 'Update stock item details (name, thresholds, max stock).',
        requestBody: `{
  "name": "Aperol",
  "reorderThreshold": 4,
  "maxStock": 15
}`,
        response: `{ "id": "stock-l99", "reorderThreshold": 4, "maxStock": 15 }`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'PATCH',
        path: '/api/stock/{stockItemId}/count',
        description: 'Update the current stock count for a single item (daily inventory entry). Automatically creates a history entry of type "adjusted".',
        requestBody: `{
  "currentStock": 5,
  "updatedBy": "Alex",
  "note": "Manual adjustment"
}`,
        response: `{
  "id": "stock-s1",
  "currentStock": 5,
  "status": "ok",
  "lastUpdated": "2026-07-24T18:00:00Z",
  "historyEntryId": "hist-099"
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/stock/bulk-update',
        description: 'Bulk update stock counts for multiple items at once (end-of-day inventory count). Creates "adjusted" history entries for each item.',
        requestBody: `{
  "updates": [
    { "id": "stock-s1", "currentStock": 4 },
    { "id": "stock-s2", "currentStock": 1 },
    { "id": "stock-l1", "currentStock": 3 }
  ],
  "updatedBy": "Alex",
  "note": "Evening inventory count"
}`,
        response: `{
  "updatedCount": 3,
  "alerts": [
    { "id": "stock-s2", "name": "Hendrick's Gin", "status": "critical" }
  ],
  "timestamp": "2026-07-24T18:00:00Z"
}`,
        auth: 'Bearer Token',
      },
      {
        method: 'POST',
        path: '/api/stock/reconcile',
        description: 'End-of-shift inventory reconciliation — submit actual physical counts for multiple items. The system computes variance (actual − system), updates stock counts, and creates "reconciled" history entries for each item. Returns a summary of all variances.',
        requestBody: `{
  "shiftId": "shift-2026-07-24-evening",
  "reconciledBy": "Casey Wong",
  "note": "End-of-shift count — evening service",
  "items": [
    { "stockItemId": "stock-s1", "actualCount": 4 },
    { "stockItemId": "stock-s2", "actualCount": 1 },
    { "stockItemId": "stock-m1", "actualCount": 2 },
    { "stockItemId": "stock-c1", "actualCount": 7 }
  ]
}`,
        response: `{
  "reconciliationId": "rec-20260724-001",
  "shiftId": "shift-2026-07-24-evening",
  "reconciledBy": "Casey Wong",
  "timestamp": "2026-07-24T23:59:00Z",
  "totalItems": 4,
  "matchedItems": 2,
  "varianceItems": 2,
  "summary": [
    {
      "stockItemId": "stock-s1",
      "name": "Don Julio 1942",
      "systemCount": 5,
      "actualCount": 4,
      "variance": -1,
      "newStatus": "ok"
    },
    {
      "stockItemId": "stock-s2",
      "name": "Hendrick's Gin",
      "systemCount": 1,
      "actualCount": 1,
      "variance": 0,
      "newStatus": "critical"
    },
    {
      "stockItemId": "stock-m1",
      "name": "Fever-Tree Tonic",
      "systemCount": 3,
      "actualCount": 2,
      "variance": -1,
      "newStatus": "low"
    },
    {
      "stockItemId": "stock-c1",
      "name": "Cocktail Napkins",
      "systemCount": 6,
      "actualCount": 7,
      "variance": 1,
      "newStatus": "ok"
    }
  ]
}`,
        auth: 'Bearer Token (Manager/Admin)',
      },
      {
        method: 'GET',
        path: '/api/stock/reconciliations',
        description: 'List all past end-of-shift reconciliation records. Supports optional ?shiftId=&from=ISO&to=ISO query params.',
        response: `[
  {
    "reconciliationId": "rec-20260724-001",
    "shiftId": "shift-2026-07-24-evening",
    "reconciledBy": "Casey Wong",
    "timestamp": "2026-07-24T23:59:00Z",
    "totalItems": 18,
    "varianceItems": 3
  },
  {
    "reconciliationId": "rec-20260723-001",
    "shiftId": "shift-2026-07-23-evening",
    "reconciledBy": "Alex Miller",
    "timestamp": "2026-07-23T23:45:00Z",
    "totalItems": 18,
    "varianceItems": 1
  }
]`,
        auth: 'Bearer Token (Manager/Admin)',
      },
      {
        method: 'GET',
        path: '/api/stock/reconciliations/{reconciliationId}',
        description: 'Get full details of a specific reconciliation record including all item variances.',
        response: `{
  "reconciliationId": "rec-20260724-001",
  "shiftId": "shift-2026-07-24-evening",
  "reconciledBy": "Casey Wong",
  "note": "End-of-shift count — evening service",
  "timestamp": "2026-07-24T23:59:00Z",
  "totalItems": 18,
  "varianceItems": 3,
  "summary": [
    {
      "stockItemId": "stock-s1",
      "name": "Don Julio 1942",
      "systemCount": 5,
      "actualCount": 4,
      "variance": -1,
      "newStatus": "ok"
    }
  ]
}`,
        auth: 'Bearer Token (Manager/Admin)',
      },
      {
        method: 'DELETE',
        path: '/api/stock/{stockItemId}',
        description: 'Delete a stock item.',
        response: `{ "message": "Stock item deleted" }`,
        auth: 'Bearer Token (Admin)',
      },
    ],
  },
  {
    id: 'staff-management',
    title: 'Staff Management & PIN',
    moduleLabel: 'Staff Management API',
    icon: '👥',
    color: '#f59e0b',
    description: 'Admin-only staff account CRUD with role assignment and terminal PIN setup.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/staff',
        description: 'List all staff accounts with role, status, terminal assignment, and shift stats.',
        response: `[
  {
    "id": "u1",
    "name": "Alex Miller",
    "email": "alex@skybar.com",
    "role": "Admin",
    "status": "on_shift",
    "terminalId": "POS-01",
    "avatar": "AM",
    "joinDate": "2023-01-15",
    "lastActive": "2 min ago",
    "shiftsThisWeek": 5,
    "hasPin": true
  }
]`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'GET',
        path: '/api/staff/{staffId}',
        description: 'Get a single staff member by ID.',
        response: `{
  "id": "u1",
  "name": "Alex Miller",
  "email": "alex@skybar.com",
  "role": "Admin",
  "status": "on_shift",
  "terminalId": "POS-01",
  "avatar": "AM",
  "joinDate": "2023-01-15",
  "lastActive": "2 min ago",
  "shiftsThisWeek": 5,
  "hasPin": true
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/staff',
        description: 'Create a new staff account with role assignment. Password is hashed server-side.',
        requestBody: `{
  "name": "Jordan Lee",
  "email": "jordan@skybar.com",
  "role": "Bartender",
  "terminalId": "POS-02",
  "password": "securePassword123"
}`,
        response: `{
  "id": "u2",
  "name": "Jordan Lee",
  "email": "jordan@skybar.com",
  "role": "Bartender",
  "status": "inactive",
  "terminalId": "POS-02",
  "avatar": "JL",
  "joinDate": "2026-07-24",
  "lastActive": "Never",
  "shiftsThisWeek": 0,
  "hasPin": false
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PUT',
        path: '/api/staff/{staffId}',
        description: 'Update staff account details — name, email, role, terminal assignment.',
        requestBody: `{
  "name": "Jordan Lee",
  "email": "jordan@skybar.com",
  "role": "Manager",
  "terminalId": "POS-02"
}`,
        response: `{
  "id": "u2",
  "name": "Jordan Lee",
  "role": "Manager",
  "terminalId": "POS-02",
  "updatedAt": "2026-07-24T22:00:00Z"
}`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'DELETE',
        path: '/api/staff/{staffId}',
        description: 'Permanently delete a staff account and revoke all access.',
        response: `{ "message": "Staff account deleted", "id": "u2" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'PATCH',
        path: '/api/staff/{staffId}/toggle-status',
        description: 'Toggle staff status between active and inactive.',
        response: `{ "id": "u2", "status": "active" }`,
        auth: 'Bearer Token (Admin)',
      },
      {
        method: 'POST',
        path: '/api/staff/{staffId}/pin',
        description: 'Set or update the 4-digit terminal PIN for a staff member. PIN is stored as a bcrypt hash.',
        requestBody: `{ "pin": "1234" }`,
        response: `{ "success": true, "message": "PIN set successfully" }`,
        auth: 'Bearer Token (Admin or self)',
      },
      {
        method: 'POST',
        path: '/api/staff/{staffId}/pin/verify',
        description: 'Verify a staff member\'s terminal PIN (used for lock screen unlock).',
        requestBody: `{ "pin": "1234" }`,
        response: `{ "success": true, "staffId": "u2", "name": "Jordan Lee", "role": "Bartender" }`,
        auth: 'Bearer Token',
      },
      {
        method: 'DELETE',
        path: '/api/staff/{staffId}/pin',
        description: 'Remove/reset a staff member\'s terminal PIN.',
        response: `{ "success": true, "message": "PIN removed" }`,
        auth: 'Bearer Token (Admin)',
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics & Reporting',
    moduleLabel: 'Analytics API',
    icon: '📊',
    color: '#06b6d4',
    description: 'Hourly revenue, top items sold, table turnover rate, and staff performance metrics with date range filters.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/analytics/summary',
        description: 'Full analytics summary — hourly revenue, top items, table turnover, and staff performance. Supports date range filtering.',
        response: `// Query params: ?range=today|yesterday|7d|30d|custom&from=2026-07-01&to=2026-07-24
{
  "totalRevenue": 55240,
  "totalOrders": 642,
  "avgOrderValue": 86.04,
  "totalCovers": 1136,
  "hourlyRevenue": [
    { "hour": "12PM", "revenue": 1240, "orders": 18 },
    { "hour": "9PM",  "revenue": 6120, "orders": 84 }
  ],
  "topItems": [
    { "name": "Signature Skyline Cocktail", "menuItemId": "mi-001", "category": "Cocktails", "qty": 142, "revenue": 4970 }
  ],
  "tableTurnover": [
    { "zone": "VIP Edge Skyline", "avgMinutes": 94, "turns": 3.2, "revenue": 18400 }
  ],
  "staffPerformance": [
    { "staffId": "u2", "name": "Jordan Lee", "role": "Bartender", "orders": 184, "revenue": 9240, "avgOrderValue": 50.2, "covers": 312 }
  ]
}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/hourly-revenue',
        description: 'Hourly revenue and order count breakdown for the selected date range.',
        response: `// Query params: ?range=today&from=&to=
[
  { "hour": "12PM", "revenue": 1240, "orders": 18 },
  { "hour": "1PM",  "revenue": 1890, "orders": 27 },
  { "hour": "9PM",  "revenue": 6120, "orders": 84 },
  { "hour": "10PM", "revenue": 5480, "orders": 72 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/top-items',
        description: 'Top menu items ranked by quantity sold and revenue for the selected period.',
        response: `// Query params: ?range=today&limit=10
[
  { "name": "Signature Skyline Cocktail", "menuItemId": "mi-001", "category": "Cocktails", "qty": 142, "revenue": 4970 },
  { "name": "Premium Whisky Sour",        "menuItemId": "mi-002", "category": "Cocktails", "qty": 118, "revenue": 3894 },
  { "name": "Champagne Bottle Service",   "menuItemId": "mi-010", "category": "Bottles",   "qty": 24,  "revenue": 7200 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/table-turnover',
        description: 'Table turnover rate per zone — average seated time, number of turns, and revenue generated.',
        response: `// Query params: ?range=today
[
  { "zone": "VIP Edge Skyline", "avgMinutes": 94,  "turns": 3.2, "revenue": 18400 },
  { "zone": "Main Bar",         "avgMinutes": 42,  "turns": 7.8, "revenue": 12600 },
  { "zone": "Outdoor Terrace",  "avgMinutes": 68,  "turns": 4.9, "revenue": 9800  },
  { "zone": "Cabana Deck",      "avgMinutes": 112, "turns": 2.8, "revenue": 14200 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/staff-performance',
        description: 'Staff performance metrics — orders handled, revenue generated, average order value, and covers served.',
        response: `// Query params: ?range=today&staffId=u2 (optional filter)
[
  { "staffId": "u2", "name": "Jordan Lee",   "role": "Bartender", "orders": 184, "revenue": 9240, "avgOrderValue": 50.2, "covers": 312 },
  { "staffId": "u3", "name": "Sam Rivera",   "role": "Bartender", "orders": 162, "revenue": 8100, "avgOrderValue": 50.0, "covers": 278 },
  { "staffId": "u1", "name": "Alex Miller",  "role": "Admin",     "orders": 96,  "revenue": 5760, "avgOrderValue": 60.0, "covers": 168 }
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/transactions',
        description:
          'Paid orders list for **Reports** (/reports). Query: ?range=today|yesterday|7d|30d|custom&from=&to=. Include **openedAt**, **closedAt**, **staffId**, **staffName** (join users — not "unknown"). Optional **orderId** on row for detail modal.',
        response: `[
  {
    "id": "pay-001",
    "paymentId": "pay-001",
    "orderId": "ord-table-v3-20261009",
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
]`,
        auth: 'Bearer Token (Admin/Manager)',
      },
      {
        method: 'GET',
        path: '/api/analytics/transactions/{paymentId}',
        description:
          'Order/payment detail when user clicks eye on Reports. Same **OrderDetailResponse** as GET /orders/details/{orderId}. Split sessions show guestLabel on payments[] when available.',
        response: `// Same JSON as GET /api/orders/details/{orderId}`,
        auth: 'Bearer Token (Admin/Manager)',
      },
    ],
  },
];

const ROLES_TABLE = [
  { role: 'Admin', permissions: 'Full access — all endpoints, config, user management, zone management' },
  { role: 'Manager', permissions: 'Orders, payments, bookings, dashboard, KDS, shift management, manager PIN actions' },
  { role: 'Bartender', permissions: 'Orders, KDS, floor map (own tables), menu browsing' },
  { role: 'Cashier', permissions: 'Payments, split bill, shift summary, drawer reconciliation' },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-black/40 border border-border/50 rounded-lg p-3 text-xs text-emerald-300 overflow-x-auto font-mono leading-relaxed">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-muted/60 border border-border text-muted-foreground hover:text-foreground"
      >
        {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-all text-left"
      >
        <span className={`px-2 py-0.5 rounded text-xs font-bold border font-mono flex-shrink-0 ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </span>
        <span className="text-sm font-mono text-foreground flex-1">{ep.path}</span>
        {ep.auth && (
          <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Lock size={10} />{ep.auth}
          </span>
        )}
        {open ? <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
          <p className="text-sm text-muted-foreground">{ep.description}</p>
          {ep.auth && (
            <div className="flex items-center gap-2 text-xs">
              <Lock size={11} className="text-amber-400" />
              <span className="text-amber-400 font-medium">Auth:</span>
              <span className="text-muted-foreground">{ep.auth}</span>
            </div>
          )}
          {ep.requestBody && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Request Body</p>
              <CodeBlock code={ep.requestBody} />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Response</p>
            <CodeBlock code={ep.response} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiSpecPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const totalEndpoints = API_SECTIONS.reduce((a, s) => a + s.endpoints.length, 0);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'rgba(15,23,42,0.97)', borderBottom: '1px solid rgba(100,116,139,0.15)', backdropFilter: 'blur(20px)' }} className="sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ArrowLeft size={16} />
            <span className="text-sm hidden sm:inline">Back to App</span>
          </Link>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Server size={15} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">SkyBar POS — Backend API Spec</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Spring Boot REST API · {totalEndpoints} endpoints across {API_SECTIONS.length} modules</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">

        {/* Intro Banner */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <div className="flex items-start gap-3 mb-4">
            <Globe size={20} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-foreground mb-1">Spring Boot Backend — Implementation Guide</h2>
              <p className="text-sm text-muted-foreground">This document covers every API endpoint the SkyBar POS frontend needs. Build these in Spring Boot and the Next.js frontend will connect to them.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Base URL', value: 'http://localhost:8080', icon: <Server size={13} /> },
              { label: 'Auth', value: 'JWT Bearer Token', icon: <Lock size={13} /> },
              { label: 'Content-Type', value: 'application/json', icon: <Database size={13} /> },
              { label: 'Total Endpoints', value: `${totalEndpoints} endpoints`, icon: <Globe size={13} /> },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3" style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(100,116,139,0.15)' }}>
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{item.icon}<span className="text-xs">{item.label}</span></div>
                <p className="text-xs font-semibold text-foreground font-mono">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Global Headers */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(100,116,139,0.15)' }}>
          <div className="px-5 py-3 border-b border-border/40" style={{ background: 'rgba(30,41,59,0.4)' }}>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Lock size={14} className="text-amber-400" />Global Request Headers</h3>
          </div>
          <div className="p-5">
            <CodeBlock code={`Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept: application/json`} />
            <p className="text-xs text-muted-foreground mt-3">All protected endpoints require the <span className="text-amber-400 font-mono">Authorization</span> header. Public endpoints: <span className="font-mono text-cyan-400">POST /api/auth/login</span> and <span className="font-mono text-cyan-400">POST /api/auth/refresh</span>.</p>
          </div>
        </div>

        {/* Role Permissions */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(100,116,139,0.15)' }}>
          <div className="px-5 py-3 border-b border-border/40" style={{ background: 'rgba(30,41,59,0.4)' }}>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">👑 Role-Based Access Control (RBAC)</h3>
          </div>
          <div className="divide-y divide-border/30">
            {ROLES_TABLE.map(r => (
              <div key={r.role} className="px-5 py-3 flex items-start gap-4">
                <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}>{r.role}</span>
                <p className="text-sm text-muted-foreground">{r.permissions}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Error Responses */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(100,116,139,0.15)' }}>
          <div className="px-5 py-3 border-b border-border/40" style={{ background: 'rgba(30,41,59,0.4)' }}>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">⚠️ Standard Error Response Format</h3>
          </div>
          <div className="p-5">
            <CodeBlock code={`// All errors follow this structure:
{
  "status": 400,
  "error": "Bad Request",
  "message": "tableId is required",
  "timestamp": "2026-07-24T20:00:00Z",
  "path": "/api/orders/table-v1/items"
}

// HTTP Status Codes used:
// 200 OK           — Success
// 201 Created      — Resource created
// 400 Bad Request  — Validation error
// 401 Unauthorized — Missing or invalid token
// 403 Forbidden    — Insufficient role permissions
// 404 Not Found    — Resource not found
// 409 Conflict     — Duplicate or state conflict
// 500 Server Error — Internal error`} />
          </div>
        </div>

        {/* API Sections */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Database size={16} className="text-cyan-400" />
            API Modules
          </h2>
          {API_SECTIONS.map(section => (
            <div key={section.id} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${section.color}25` }}>
              <button
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-all text-left"
                style={{ background: `${section.color}06` }}
              >
                <span className="text-xl flex-shrink-0">{section.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Module label badge */}
                    <span className="text-xs font-bold px-2 py-0.5 rounded font-mono" style={{ background: `${section.color}20`, color: section.color, border: `1px solid ${section.color}40` }}>
                      {section.moduleLabel}
                    </span>
                    <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${section.color}15`, color: section.color, border: `1px solid ${section.color}30` }}>
                      {section.endpoints.length} endpoints
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{section.description}</p>
                </div>
                {activeSection === section.id
                  ? <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                  : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />}
              </button>

              {activeSection === section.id && (
                <div className="px-5 pb-5 space-y-2 border-t border-border/30 pt-4">
                  {section.endpoints.map((ep, i) => (
                    <EndpointCard key={`${section.id}-ep-${i}`} ep={ep} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Spring Boot Setup Note */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <span>☕</span> Spring Boot Setup Notes
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Use <span className="text-emerald-400 font-mono">spring-boot-starter-security</span> + <span className="text-emerald-400 font-mono">jjwt</span> for JWT authentication.</p>
            <p>• Use <span className="text-emerald-400 font-mono">spring-boot-starter-data-jpa</span> + PostgreSQL</p>
            <p>• Enable CORS for <span className="text-emerald-400 font-mono">http://localhost:3000</span> (dev) and <span className="text-emerald-400 font-mono">https://skybarpos2848.builtwithrocket.new</span> (prod).</p>
            <p>• Use <span className="text-emerald-400 font-mono">@PreAuthorize</span> annotations to enforce role-based access per endpoint.</p>
            <p>• WebSocket (STOMP over SockJS) for real-time events: <span className="text-emerald-400 font-mono">spring-boot-starter-websocket</span> + <span className="text-emerald-400 font-mono">@stomp/stompjs</span> on the frontend. Topics: <span className="text-emerald-400 font-mono">/topic/orders/new</span>, <span className="text-emerald-400 font-mono">/topic/kds/updates</span>, <span className="text-emerald-400 font-mono">/topic/tables/status</span>, <span className="text-emerald-400 font-mono">/topic/bookings/reminders</span>.</p>
            <p>• Booking reminders: use a scheduled task (<span className="text-emerald-400 font-mono">@Scheduled</span>) that runs every minute, queries bookings arriving in exactly 15 minutes, and broadcasts via <span className="text-emerald-400 font-mono">SimpMessagingTemplate.convertAndSend("/topic/bookings/reminders", payload)</span>.</p>
            <p>• SSE fallback via <span className="text-emerald-400 font-mono">SseEmitter</span> at <span className="text-emerald-400 font-mono">GET /api/events/orders</span> — use when WebSocket is blocked.</p>
            <p>• Zone printers stored in a <span className="text-emerald-400 font-mono">zone_printers</span> table with <span className="text-emerald-400 font-mono">zone_id</span>, <span className="text-emerald-400 font-mono">name</span>, <span className="text-emerald-400 font-mono">printer_ip</span>, <span className="text-emerald-400 font-mono">printer_port</span>, <span className="text-emerald-400 font-mono">is_default</span>. One zone can have many printers.</p>
            <p>• All monetary values stored as <span className="text-emerald-400 font-mono">DECIMAL(10,2)</span> in the database.</p>
            <p>• Timestamps in ISO 8601 format: <span className="text-emerald-400 font-mono">2026-07-24T20:30:00Z</span></p>
            <p>• Staff PINs stored as bcrypt hashes in <span className="text-emerald-400 font-mono">staff_pins</span> table — never return raw PIN values in any response.</p>
            <p>• Analytics endpoints aggregate from <span className="text-emerald-400 font-mono">orders</span>, <span className="text-emerald-400 font-mono">order_items</span>, <span className="text-emerald-400 font-mono">shifts</span>, and <span className="text-emerald-400 font-mono">tables</span> tables. Cache results in <span className="text-emerald-400 font-mono">analytics_snapshots</span> for performance.</p>
          </div>
        </div>

        {/* Database Schema Hint */}
        <div className="rounded-2xl p-5 md:p-6" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Database size={14} className="text-purple-400" /> Suggested Database Tables
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {['users', 'staff_pins', 'zones', 'zone_printers', 'tables', 'menu_items', 'menu_item_sizes', 'orders', 'order_items', 'kds_tickets', 'bookings', 'payments', 'payment_splits', 'shifts', 'shift_transactions', 'venue_config', 'stock_items', 'notifications', 'ws_sessions', 'analytics_snapshots', 'staff_shifts', 'staff_availability', 'kds_assignments'].map(table => (
              <div key={table} className="px-3 py-2 rounded-lg text-xs font-mono text-purple-300" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                {table}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          SkyBar POS · API Specification v1.0 · Generated for Spring Boot backend development
        </p>
      </div>
    </div>
  );
}
