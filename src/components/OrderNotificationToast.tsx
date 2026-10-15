'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ChefHat, X, UtensilsCrossed } from 'lucide-react';

export interface OrderNotification {
  id: string;
  tableLabel: string;
  zone: string;
  staff: string;
  items: { name: string; qty: number }[];
  timestamp: Date;
}

interface OrderNotificationContextValue {
  fireOrderNotification: (notification: Omit<OrderNotification, 'id' | 'timestamp'>) => void;
}

const OrderNotificationContext = createContext<OrderNotificationContextValue>({
  fireOrderNotification: () => {},
});

export function useOrderNotification() {
  return useContext(OrderNotificationContext);
}

// Individual toast card
function OrderToastCard({
  notification,
  onDismiss,
}: {
  notification: OrderNotification;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const enterTimer = setTimeout(() => setVisible(true), 20);
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, 6000);
    return () => {
      clearTimeout(enterTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(notification.id), 320);
  }, [notification.id, onDismiss]);

  const timeStr = notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
        border: '1px solid rgba(16,185,129,0.35)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'rgba(16,185,129,0.12)',
          borderBottom: '1px solid rgba(16,185,129,0.2)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <ChefHat size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-400 leading-tight">New Order Placed</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{timeStr}</p>
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
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-foreground">{notification.tableLabel}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium text-muted-foreground"
            style={{ background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.2)' }}
          >
            {notification.zone}
          </span>
        </div>

        <div className="space-y-1 mb-2.5">
          {notification.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <UtensilsCrossed size={10} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-foreground">{item.name}</span>
              <span className="ml-auto text-xs font-semibold text-emerald-400">×{item.qty}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-[8px] font-bold text-primary">{notification.staff.charAt(0)}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            by <span className="text-foreground font-medium">{notification.staff}</span>
          </span>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div style={{ height: '3px', background: 'rgba(16,185,129,0.15)' }}>
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, rgba(16,185,129,0.8), rgba(16,185,129,0.4))',
            animation: 'orderNotifShrink 6s linear forwards',
          }}
        />
      </div>

      <style>{`
        @keyframes orderNotifShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

// Provider wraps the app and renders the toast stack
export function OrderNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);

  const fireOrderNotification = useCallback(
    (data: Omit<OrderNotification, 'id' | 'timestamp'>) => {
      const notification: OrderNotification = {
        ...data,
        id: `order-notif-${Date.now()}`,
        timestamp: new Date(),
      };
      setNotifications(prev => [notification, ...prev].slice(0, 5));
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <OrderNotificationContext.Provider value={{ fireOrderNotification }}>
      {children}

      {/* Toast stack — top-right, slides in from right like Messenger */}
      <div
        style={{
          position: 'fixed',
          top: '80px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          pointerEvents: 'none',
        }}
        aria-live="polite"
        aria-label="Order notifications"
      >
        {notifications.map(n => (
          <div key={n.id} style={{ pointerEvents: 'auto' }}>
            <OrderToastCard notification={n} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </OrderNotificationContext.Provider>
  );
}
