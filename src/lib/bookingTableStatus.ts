import type { Booking, TableStatus } from '@/lib/api/types';

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getReservedTableIds(bookings: Booking[], forDate = localDateString()): Set<string> {
  return new Set(
    bookings
      .filter((b) => b.status === 'upcoming' && b.date === forDate)
      .map((b) => b.tableId),
  );
}

export function tableHasUpcomingBooking(
  bookings: Booking[],
  tableId: string,
  forDate = localDateString(),
): boolean {
  return bookings.some(
    (b) => b.tableId === tableId && b.status === 'upcoming' && b.date === forDate,
  );
}

function reservedViewMatches<T extends { id: string; status: TableStatus }>(prev: T, source: T): boolean {
  if (prev.status !== 'reserved' || prev.id !== source.id) return false;
  const fields = ['label', 'zone', 'guests', 'capacity', 'staff', 'seatedMinutes', 'minSpend', 'orderTotal', 'shape', 'x', 'y'] as const;
  return fields.every((key) => (prev as Record<string, unknown>)[key] === (source as Record<string, unknown>)[key]);
}

/**
 * Show booked tables as reserved when the API table is still `available`.
 * `cache` keeps the same reserved object across refreshes so unchanged tables
 * are not redrawn.
 */
export function applyBookingStatus<T extends { id: string; status: TableStatus }>(
  tables: T[],
  bookings: Booking[],
  forDate = localDateString(),
  cache?: Map<string, T>,
): T[] {
  const reservedIds = getReservedTableIds(bookings, forDate);
  const next = tables.map((t) => {
    if (t.status === 'available' && reservedIds.has(t.id)) {
      const prev = cache?.get(t.id);
      if (prev && reservedViewMatches(prev, t)) return prev;
      const view = { ...t, status: 'reserved' as const };
      cache?.set(t.id, view);
      return view;
    }
    if (cache?.has(t.id)) cache.delete(t.id);
    return t;
  });
  if (cache) {
    for (const id of [...cache.keys()]) {
      if (!reservedIds.has(id)) cache.delete(id);
    }
  }
  if (next.every((row, index) => row === tables[index])) return tables;
  return next;
}
