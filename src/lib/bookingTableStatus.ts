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

/** Show booked tables as reserved when the API table is still `available`. */
export function applyBookingStatus<T extends { id: string; status: TableStatus }>(
  tables: T[],
  bookings: Booking[],
  forDate = localDateString(),
): T[] {
  const reservedIds = getReservedTableIds(bookings, forDate);
  return tables.map((t) => {
    if (t.status === 'available' && reservedIds.has(t.id)) {
      return { ...t, status: 'reserved' as const };
    }
    return t;
  });
}
