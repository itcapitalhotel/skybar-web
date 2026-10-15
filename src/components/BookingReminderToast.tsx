'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CalendarClock, X, Users, MapPin } from 'lucide-react';
import { getAuthToken, getWsBaseUrl } from '@/lib/api/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingReminder {
  id: string;
  guestName: string;
  tableLabel: string;
  zone: string;
  arrivalTime: string; // e.g. "7:30 PM"
  partySize?: number;
  timestamp: Date;
}

interface BookingReminderContextValue {
  fireBookingReminder: (reminder: Omit<BookingReminder, 'id' | 'timestamp'>) => void;
}

const BookingReminderContext = createContext<BookingReminderContextValue>({
  fireBookingReminder: () => {},
});

export function useBookingReminder() {
  return useContext(BookingReminderContext);
}

// ─── Individual Toast Card ────────────────────────────────────────────────────

function BookingReminderCard({
  reminder,
  onDismiss,
}: {
  reminder: BookingReminder;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const enterTimer = setTimeout(() => setVisible(true), 20);
    timerRef.current = setTimeout(() => handleDismiss(), 8000);
    return () => {
      clearTimeout(enterTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(reminder.id), 320);
  }, [reminder.id, onDismiss]);

  return (
    <div
      style={{
        transform: visible && !leaving ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
        opacity: leaving ? 0 : 1,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        willChange: 'transform, opacity',
        width: '320px',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
        background: 'rgba(15,23,42,0.97)',
        border: '1px solid rgba(245,158,11,0.35)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'rgba(245,158,11,0.10)',
          borderBottom: '1px solid rgba(245,158,11,0.2)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            <CalendarClock size={14} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight" style={{ color: '#f59e0b' }}>
              Arriving in 15 min
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">Reservation Reminder</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Guest name */}
        <p className="text-sm font-bold text-foreground mb-2">{reminder.guestName}</p>

        {/* Table + Zone */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-foreground font-medium">{reminder.tableLabel}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md font-medium text-muted-foreground"
              style={{ background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.2)' }}
            >
              {reminder.zone}
            </span>
          </div>
        </div>

        {/* Arrival time + party size */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={11} style={{ color: '#f59e0b' }} className="flex-shrink-0" />
            <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
              {reminder.arrivalTime}
            </span>
          </div>
          {reminder.partySize !== undefined && (
            <div className="flex items-center gap-1.5">
              <Users size={11} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground">{reminder.partySize} guests</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div style={{ height: '3px', background: 'rgba(245,158,11,0.15)' }}>
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, rgba(245,158,11,0.8), rgba(245,158,11,0.4))',
            animation: 'bookingReminderShrink 8s linear forwards',
          }}
        />
      </div>

      <style>{`
        @keyframes bookingReminderShrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}

// ─── WebSocket STOMP subscriber ───────────────────────────────────────────────

const WS_TOPIC = '/topic/bookings/reminders';

/** Minimal STOMP-over-WebSocket client (no external library needed). */
function useBookingReminderSocket(
  onReminder: (reminder: Omit<BookingReminder, 'id' | 'timestamp'>, bookingId?: string) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string>('sub-bookings-reminders');
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const wsBase = getWsBaseUrl();

    const wsUrl = `${wsBase}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      // WebSocket not available (SSR guard) — silently skip
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      // STOMP CONNECT frame
      const token = getAuthToken();
      const connectFrame = [
        'CONNECT',
        'accept-version:1.2',
        'heart-beat:0,0',
        token ? `Authorization:Bearer ${token}` : '',
        '',
        '\0',
      ]
        .filter(Boolean)
        .join('\n');
      ws.send(connectFrame);
    };

    ws.onmessage = (event: MessageEvent) => {
      const raw: string = typeof event.data === 'string' ? event.data : '';

      // Handle STOMP CONNECTED frame — subscribe after handshake
      if (raw.startsWith('CONNECTED')) {
        const subFrame = [
          'SUBSCRIBE',
          `id:${subscriptionIdRef.current}`,
          `destination:${WS_TOPIC}`,
          '',
          '\0',
        ].join('\n');
        ws.send(subFrame);
        return;
      }

      // Handle STOMP MESSAGE frame
      if (raw.startsWith('MESSAGE')) {
        // Extract JSON body (after the blank line separating headers from body)
        const bodyStart = raw.indexOf('\n\n');
        if (bodyStart === -1) return;
        const body = raw.slice(bodyStart + 2).replace(/\0$/, '');
        try {
          const payload = JSON.parse(body);
          // Map backend payload → BookingReminder shape
          const bookingId = payload.bookingId ?? payload.booking_id;
          const reminder: Omit<BookingReminder, 'id' | 'timestamp'> = {
            guestName: payload.guestName ?? payload.guest_name ?? 'Guest',
            tableLabel: payload.tableLabel ?? payload.table_label ?? payload.table ?? 'Table',
            zone: payload.zone ?? payload.zoneName ?? payload.zone_name ?? '',
            arrivalTime: payload.arrivalTime ?? payload.arrival_time ?? payload.time ?? '',
            partySize: payload.partySize ?? payload.party_size ?? payload.guests,
          };
          onReminder(reminder, bookingId);
        } catch {
          // Ignore malformed payloads
        }
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // Reconnect after 5 s
      reconnectRef.current = setTimeout(() => connect(), 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onReminder]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BookingReminderProvider({ children }: { children: React.ReactNode }) {
  const [reminders, setReminders] = useState<BookingReminder[]>([]);
  const seenBookingIdsRef = useRef<Set<string>>(new Set());

  const fireBookingReminder = useCallback(
    (data: Omit<BookingReminder, 'id' | 'timestamp'>) => {
      const reminder: BookingReminder = {
        ...data,
        id: `booking-reminder-${Date.now()}`,
        timestamp: new Date(),
      };
      setReminders(prev => [reminder, ...prev].slice(0, 5));
    },
    []
  );

  const handleIncomingReminder = useCallback(
    (data: Omit<BookingReminder, 'id' | 'timestamp'>, bookingId?: string) => {
      if (bookingId) {
        if (seenBookingIdsRef.current.has(bookingId)) return;
        seenBookingIdsRef.current.add(bookingId);
      }
      fireBookingReminder(data);
    },
    [fireBookingReminder],
  );

  const dismiss = useCallback((id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  }, []);

  useBookingReminderSocket(handleIncomingReminder);

  return (
    <BookingReminderContext.Provider value={{ fireBookingReminder }}>
      {children}

      {/* Toast stack — offset below order notifications */}
      <div
        style={{
          position: 'fixed',
          top: '80px',
          right: '352px', // sits left of the order notification stack (320px + 16px gap + 16px)
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          pointerEvents: 'none',
        }}
        aria-live="polite"
        aria-label="Booking reminder notifications"
      >
        {reminders.map(r => (
          <div key={r.id} style={{ pointerEvents: 'auto' }}>
            <BookingReminderCard reminder={r} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </BookingReminderContext.Provider>
  );
}
