'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import { Bell, CheckCircle2, CalendarClock, Info, Package, ShoppingBag, Clock, Trash2, CheckCheck, Filter, X } from 'lucide-react';
import { notificationsApi } from '@/lib/api/client';
import type { AppNotification, NotificationType, NotificationPriority } from '@/lib/api/types';


const TYPE_FILTERS: { value: NotificationType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stock', label: 'Stock' },
  { value: 'order', label: 'Orders' },
  { value: 'booking', label: 'Bookings' },
  { value: 'system', label: 'System' },
];

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  stock: {
    icon: <Package size={16} />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  order: {
    icon: <ShoppingBag size={16} />,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
  booking: {
    icon: <CalendarClock size={16} />,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  system: {
    icon: <Info size={16} />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
};

const PRIORITY_CONFIG: Record<NotificationPriority, { dot: string; label: string }> = {
  critical: { dot: 'bg-rose-500', label: 'Critical' },
  high: { dot: 'bg-orange-400', label: 'High' },
  warning: { dot: 'bg-amber-400', label: 'Warning' },
  info: { dot: 'bg-blue-400', label: 'Info' },
  success: { dot: 'bg-emerald-400', label: 'Ready' },
};

const DEFAULT_TYPE_CONFIG = TYPE_CONFIG.system;
const DEFAULT_PRIORITY_CONFIG = PRIORITY_CONFIG.info;

function normalizeNotification(raw: AppNotification): AppNotification {
  const type = raw.type in TYPE_CONFIG ? raw.type : 'system';
  const priority = raw.priority in PRIORITY_CONFIG ? raw.priority : 'info';
  return {
    ...raw,
    type,
    priority,
    timestamp: raw.timestamp ?? raw.createdAt ?? 'Just now',
    read: Boolean(raw.read),
  };
}

export default function NotificationsPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<NotificationType | 'all'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // ── Fetch notifications from API ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    notificationsApi.list()
      .then(data => {
        if (!cancelled) {
          setNotifications(Array.isArray(data) ? data.map(normalizeNotification) : []);
          setLoadError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setNotifications([]);
          setLoadError(err.message ?? 'Failed to load notifications');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = notifications.filter(n => {
    if (activeFilter !== 'all' && n.type !== activeFilter) return false;
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    try { await notificationsApi.markAllRead(); } catch { /* optimistic */ }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = async (id: string) => {
    try { await notificationsApi.markRead(id); } catch { /* optimistic */ }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const dismiss = async (id: string) => {
    try { await notificationsApi.dismiss(id); } catch { /* optimistic */ }
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = async () => {
    try { await notificationsApi.clearRead(); } catch { /* optimistic */ }
    setNotifications(prev => prev.filter(n => !n.read));
  };

  const stockCritical = notifications.filter(n => n.type === 'stock' && n.priority === 'critical' && !n.read).length;
  const ordersReady = notifications.filter(n => n.type === 'order' && n.priority === 'success' && !n.read).length;
  const bookingsSoon = notifications.filter(n => n.type === 'booking' && !n.read).length;
  const systemAlerts = notifications.filter(n => n.type === 'system' && !n.read).length;

  return (
    <div className="min-h-screen bg-background">
      {loadError && (
        <div className="max-w-3xl mx-auto px-4 pt-3">
          <p className="text-sm text-rose-400 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2">{loadError}</p>
        </div>
      )}
      <TopNav onLockTerminal={() => setLockOpen(true)} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => setLockOpen(false)} />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Bell size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all"
            >
              <Trash2 size={13} />
              Clear read
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Stock Alerts', count: stockCritical, icon: <Package size={15} />, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
            { label: 'Orders Ready', count: ordersReady, icon: <ShoppingBag size={15} />, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
            { label: 'Bookings', count: bookingsSoon, icon: <CalendarClock size={15} />, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
            { label: 'System', count: systemAlerts, icon: <Info size={15} />, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
          ].map(card => (
            <div key={card.label} className={`glass-card rounded-xl p-3 border ${card.border} flex items-center gap-3`}>
              <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center ${card.color}`}>
                {card.icon}
              </div>
              <div>
                <p className="text-lg font-bold text-foreground leading-none">{card.count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeFilter === f.value
                    ? 'bg-primary/15 text-primary' :'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowUnreadOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              showUnreadOnly
                ? 'bg-primary/15 text-primary border-primary/30' :'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <Filter size={12} />
            Unread only
          </button>
        </div>

        {/* Notification List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center border border-border">
              <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-foreground font-medium">All clear!</p>
              <p className="text-sm text-muted-foreground mt-1">No notifications match your current filter.</p>
            </div>
          ) : (
            filtered.map(n => {
              const typeConf = TYPE_CONFIG[n.type] ?? DEFAULT_TYPE_CONFIG;
              const prioConf = PRIORITY_CONFIG[n.priority] ?? DEFAULT_PRIORITY_CONFIG;
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`glass-card rounded-xl border transition-all cursor-pointer group ${
                    n.read
                      ? 'border-border opacity-70 hover:opacity-100' :'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    {/* Unread dot */}
                    <div className="mt-1 flex-shrink-0">
                      {!n.read ? (
                        <span className={`w-2 h-2 rounded-full block ${prioConf.dot}`} />
                      ) : (
                        <span className="w-2 h-2 rounded-full block bg-transparent" />
                      )}
                    </div>

                    {/* Type icon */}
                    <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${typeConf.bg} ${typeConf.color} border ${typeConf.border}`}>
                      {typeConf.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium leading-snug ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                            <Clock size={10} />
                            {n.timestamp}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-rose-400 transition-all"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                      {n.meta && (
                        <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${typeConf.bg} ${typeConf.color} border ${typeConf.border}`}>
                          {n.meta}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
