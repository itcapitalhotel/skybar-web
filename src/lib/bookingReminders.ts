import type { Booking } from '@/lib/api/types';

export const REMINDER_LEAD_MS = 15 * 60 * 1000;

/** Parse YYYY-MM-DD + HH:mm as local date/time (avoids UTC shift bugs). */
export function parseBookingDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const normalizedTime = time.length >= 5 ? time.slice(0, 5) : time;
  const [h, m] = normalizedTime.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m ?? 0, 0, 0);
}

export function isReminderEnabled(booking: Booking): boolean {
  return booking.reminderEnabled !== false;
}

export function getReminderSchedule(
  booking: Booking,
  now = Date.now(),
): { delayMs: number; shouldSchedule: boolean } {
  if (booking.status !== 'upcoming' || !isReminderEnabled(booking)) {
    return { delayMs: -1, shouldSchedule: false };
  }

  const bookingAt = parseBookingDateTime(booking.date, booking.time).getTime();
  const alertAt = bookingAt - REMINDER_LEAD_MS;

  if (now >= bookingAt) {
    return { delayMs: -1, shouldSchedule: false };
  }

  if (now >= alertAt) {
    return { delayMs: 0, shouldSchedule: true };
  }

  const delayMs = alertAt - now;
  if (delayMs > 48 * 60 * 60 * 1000) {
    return { delayMs: -1, shouldSchedule: false };
  }

  return { delayMs, shouldSchedule: true };
}

export function formatArrivalTime(time: string): string {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const d = new Date();
  d.setHours(h, m ?? 0, 0, 0);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}
