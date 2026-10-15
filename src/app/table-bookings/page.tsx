'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import { useBookingReminder } from '@/components/BookingReminderToast';
import { formatArrivalTime } from '@/lib/bookingReminders';
import { CalendarDays, Plus, Phone, User, FileText, X, CheckCircle, MapPin, Search, Trash2, Edit3, Users, Bell, BellOff, Clock } from 'lucide-react';
import { bookingsApi, tablesApi, zonesApi } from '@/lib/api/client';
import type { Booking, CreateBookingRequest, UpdateBookingRequest, TableData, ZoneData } from '@/lib/api/types';
import { localDateString, tableHasUpcomingBooking } from '@/lib/bookingTableStatus';

const INITIAL_BOOKINGS: Booking[] = [];

const EMPTY_FORM = {
  tableId: '',
  guestName: '',
  phone: '',
  notes: '',
  partySize: '2',
  date: localDateString(),
  time: '20:00',
  zonePreference: 'any',
  reminderEnabled: true,
};

export default function TableBookingsPage() {
  const { fireBookingReminder } = useBookingReminder();
  const [isLocked, setIsLocked] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [floorTables, setFloorTables] = useState<TableData[]>([]);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Fetch bookings from API ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([bookingsApi.list(), tablesApi.list(), zonesApi.list()])
      .then(([bookingData, tableData, zoneData]) => {
        if (!cancelled) {
          setBookings(bookingData);
          setFloorTables(tableData);
          setZones(zoneData);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const bookableTables = floorTables.filter(t => t.status === 'available' || t.status === 'reserved');
  const getTable = (id: string) => floorTables.find(t => t.id === id);
  const getZone = (zoneId: string) => zones.find(z => z.id === zoneId);

  const filteredBookings = bookings.filter(b => {
    const table = getTable(b.tableId);
    const matchSearch = b.guestName.toLowerCase().includes(search.toLowerCase()) ||
      b.phone.includes(search) ||
      table?.label.toLowerCase().includes(search.toLowerCase());
    const matchZone = filterZone === 'all' || table?.zone === filterZone;
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    return matchSearch && matchZone && matchStatus;
  });

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (b: Booking) => {
    setForm({
      tableId: b.tableId,
      guestName: b.guestName,
      phone: b.phone,
      notes: b.notes,
      partySize: String(b.partySize),
      date: b.date,
      time: b.time,
      zonePreference: (b as any).zonePreference || 'any',
      reminderEnabled: (b as any).reminderEnabled !== false,
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const reserveTable = async (tableId: string) => {
    try {
      await tablesApi.updateStatus(tableId, { status: 'reserved' });
      setFloorTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'reserved' } : t));
    } catch { /* ignore */ }
  };

  const releaseTable = async (tableId: string, nextBookings: Booking[]) => {
    if (tableHasUpcomingBooking(nextBookings, tableId)) return;
    try {
      await tablesApi.updateStatus(tableId, { status: 'available' });
      setFloorTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'available' } : t));
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!form.tableId || !form.guestName || !form.phone) return;
    if (editingId) {
      const previous = bookings.find(b => b.id === editingId);
      const payload: UpdateBookingRequest = {
        tableId: form.tableId,
        guestName: form.guestName,
        phone: form.phone,
        notes: form.notes,
        partySize: parseInt(form.partySize),
        date: form.date,
        time: form.time,
      };
      try {
        const updated = await bookingsApi.update(editingId, payload);
        const nextBookings = bookings.map(b => b.id === editingId ? { ...updated, zonePreference: form.zonePreference, reminderEnabled: form.reminderEnabled } as Booking : b);
        setBookings(nextBookings);
        if (form.tableId) await reserveTable(form.tableId);
        if (previous?.tableId && previous.tableId !== form.tableId) {
          await releaseTable(previous.tableId, nextBookings);
        }
      } catch {
        setBookings(prev => prev.map(b => b.id === editingId ? {
          ...b, tableId: form.tableId, guestName: form.guestName, phone: form.phone,
          notes: form.notes, partySize: parseInt(form.partySize), date: form.date, time: form.time,
          zonePreference: form.zonePreference, reminderEnabled: form.reminderEnabled,
        } : b));
      }
    } else {
      const payload: CreateBookingRequest = {
        tableId: form.tableId,
        guestName: form.guestName,
        phone: form.phone,
        notes: form.notes,
        partySize: parseInt(form.partySize),
        date: form.date,
        time: form.time,
      };
      try {
        const created = await bookingsApi.create(payload);
        const nextBookings = [{ ...created, zonePreference: form.zonePreference, reminderEnabled: form.reminderEnabled } as Booking, ...bookings];
        setBookings(nextBookings);
        await reserveTable(form.tableId);
      } catch {
        const newBooking: Booking = {
          id: `bk-${Date.now()}`, tableId: form.tableId, guestName: form.guestName,
          phone: form.phone, notes: form.notes, partySize: parseInt(form.partySize),
          date: form.date, time: form.time, status: 'upcoming', createdAt: 'Just now',
        };
        setBookings(prev => [{ ...newBooking, zonePreference: form.zonePreference, reminderEnabled: form.reminderEnabled } as any, ...prev]);
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    try { await bookingsApi.delete(id); } catch { /* optimistic */ }
    const nextBookings = bookings.filter(b => b.id !== id);
    setBookings(nextBookings);
    if (booking) await releaseTable(booking.tableId, nextBookings);
    setDeleteConfirm(null);
  };

  const handleSeat = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    try {
      const updated = await bookingsApi.seat(id);
      const nextBookings = bookings.map(b => b.id === id ? updated : b);
      setBookings(nextBookings);
      if (booking) {
        try {
          await tablesApi.updateStatus(booking.tableId, { status: 'occupied', guests: booking.partySize });
          setFloorTables(prev => prev.map(t => t.id === booking.tableId ? { ...t, status: 'occupied', guests: booking.partySize } : t));
        } catch { /* ignore */ }
      }
    } catch {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'seated' } : b));
    }
  };

  const handleCancel = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    try {
      const updated = await bookingsApi.cancel(id);
      const nextBookings = bookings.map(b => b.id === id ? updated : b);
      setBookings(nextBookings);
      if (booking) await releaseTable(booking.tableId, nextBookings);
    } catch {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    }
  };

  const fireTestReminder = async (b: Booking) => {
    try {
      await bookingsApi.testReminder(b.id);
    } catch {
      const table = getTable(b.tableId);
      const zone = getZone(table?.zone || '');
      fireBookingReminder({
        guestName: b.guestName,
        tableLabel: table?.label ? `Table ${table.label}` : 'Table',
        zone: zone?.label || '',
        arrivalTime: formatArrivalTime(b.time),
        partySize: b.partySize,
      });
    }
  };

  const STATUS_STYLES: Record<string, string> = {
    upcoming: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    seated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    cancelled: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  };

  const upcomingCount = bookings.filter(b => b.status === 'upcoming').length;
  const seatedCount = bookings.filter(b => b.status === 'seated').length;

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setIsLocked(true)} />
      {isLocked && <LockModal onUnlock={() => setIsLocked(false)} />}

      <div className="max-w-6xl mx-auto px-3 md:px-4 lg:px-6 py-4 md:py-6 space-y-4 md:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <CalendarDays size={18} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Table Bookings</h1>
              <p className="text-xs md:text-sm text-muted-foreground">{upcomingCount} upcoming · {seatedCount} seated tonight</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New </span>Booking
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            { label: 'Upcoming', value: upcomingCount, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Seated', value: seatedCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Total Tonight', value: bookings.filter(b => b.status !== 'cancelled').length, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
          ].map(s => (
            <div key={s.label} className={`glass-card rounded-xl border p-3 md:p-4 ${s.bg}`}>
              <p className={`text-xl md:text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-36 md:min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search guest, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <select
            value={filterZone}
            onChange={e => setFilterZone(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-2 md:px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-2 md:px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="seated">Seated</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Bookings List */}
        <div className="space-y-2">
          {filteredBookings.length === 0 ? (
            <div className="glass-card rounded-xl border border-border p-10 md:p-12 text-center">
              <CalendarDays size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No bookings found</p>
            </div>
          ) : (
            filteredBookings.map(booking => {
              const table = getTable(booking.tableId);
              const zone = table ? getZone(table.zone) : null;
              const reminderOn = (booking as any).reminderEnabled !== false;
              return (
                <div key={booking.id} className={`glass-card rounded-xl border border-border p-3 md:p-4 transition-all ${booking.status === 'cancelled' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2 md:gap-4">
                    {/* Time */}
                    <div className="flex-shrink-0 w-12 md:w-16 text-center">
                      <p className="text-base md:text-lg font-bold text-foreground">{booking.time}</p>
                      <p className="text-xs text-muted-foreground">{booking.date.slice(5)}</p>
                    </div>

                    {/* Table Badge */}
                    <div className="flex-shrink-0 hidden sm:block">
                      <div
                        className="w-10 md:w-12 h-10 md:h-12 rounded-xl flex items-center justify-center text-xs md:text-sm font-bold border-2"
                        style={{ borderColor: zone?.color || '#6b7280', color: zone?.color || '#6b7280', background: `${zone?.color}15` || 'transparent' }}
                      >
                        {table?.label || '?'}
                      </div>
                      <p className="text-xs text-muted-foreground text-center mt-1 truncate w-10 md:w-12">{zone?.label.split(' ')[0]}</p>
                    </div>

                    {/* Guest Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm md:text-base text-foreground">{booking.guestName}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[booking.status]}`}>
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                        {/* Zone preference badge */}
                        {(booking as any).zonePreference && (booking as any).zonePreference !== 'any' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-500/10 text-purple-400 border-purple-500/20 flex items-center gap-1">
                            <MapPin size={9} />
                            {zones.find(z => z.id === (booking as any).zonePreference)?.label.split(' ')[0] || (booking as any).zonePreference}
                          </span>
                        )}
                        {/* Reminder indicator */}
                        {reminderOn && booking.status === 'upcoming' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
                            <Bell size={9} />15 min
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Phone size={11} />{booking.phone}</span>
                        <span className="flex items-center gap-1"><Users size={11} />{booking.partySize} guests</span>
                        {table && <span className="hidden md:flex items-center gap-1"><MapPin size={11} />Table {table.label}</span>}
                      </div>
                      {booking.notes && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <FileText size={11} className="mt-0.5 flex-shrink-0" />
                          <span className="italic truncate">{booking.notes}</span>
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 md:gap-1.5 flex-shrink-0">
                      {booking.status === 'upcoming' && (
                        <>
                          <button
                            onClick={() => handleSeat(booking.id)}
                            className="px-2 md:px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-all"
                          >
                            Seat
                          </button>
                          <button
                            onClick={() => handleCancel(booking.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-all"
                          >
                            Cancel
                          </button>
                          {/* Test reminder button */}
                          <button
                            onClick={() => fireTestReminder(booking)}
                            title="Test 15-min reminder"
                            className="p-1.5 rounded-lg text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                          >
                            <Bell size={13} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => openEdit(booking)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                      >
                        <Edit3 size={14} />
                      </button>
                      {deleteConfirm === booking.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(booking.id)} className="px-2 py-1 rounded text-xs bg-rose-500 text-white font-medium">Confirm</button>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(booking.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Booking Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-lg shadow-2xl fade-in overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editingId ? 'Edit Booking' : 'New Booking'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Zone Preference */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <MapPin size={11} className="inline mr-1" />Zone Preference
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    onClick={() => setForm(p => ({ ...p, zonePreference: 'any' }))}
                    className={`py-2 rounded-lg text-xs font-medium border transition-all ${form.zonePreference === 'any' ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    Any
                  </button>
                  {zones.map(z => (
                    <button
                      key={z.id}
                      onClick={() => setForm(p => ({ ...p, zonePreference: z.id }))}
                      className="py-2 rounded-lg text-xs font-medium border transition-all"
                      style={form.zonePreference === z.id
                        ? { background: `${z.color}20`, borderColor: `${z.color}50`, color: z.color }
                        : { background: 'rgba(100,116,139,0.08)', borderColor: 'rgba(100,116,139,0.2)', color: '#64748b' }}
                    >
                      {z.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Select */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <MapPin size={11} className="inline mr-1" />Assign Table *
                </label>
                <select
                  value={form.tableId}
                  onChange={e => setForm(p => ({ ...p, tableId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Select a table…</option>
                  {zones.map(zone => (
                    <optgroup key={zone.id} label={zone.label}>
                      {floorTables.filter(t => t.zone === zone.id && (t.status === 'available' || t.status === 'reserved' || t.id === form.tableId)).map(t => (
                        <option key={t.id} value={t.id}>
                          Table {t.label} — Cap. {t.capacity} ({t.status})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Guest Name */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <User size={11} className="inline mr-1" />Guest Name *
                </label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={form.guestName}
                  onChange={e => setForm(p => ({ ...p, guestName: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <Phone size={11} className="inline mr-1" />Phone Number *
                </label>
                <input
                  type="tel"
                  placeholder="+1 555-0000"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Date, Time, Party Size */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Time</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                    <Users size={11} className="inline mr-1" />Party Size
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.partySize}
                    onChange={e => setForm(p => ({ ...p, partySize: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <FileText size={11} className="inline mr-1" />Notes
                </label>
                <textarea
                  placeholder="Special requests, occasion, dietary needs, VIP instructions…"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                />
              </div>

              {/* 15-min Reminder Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">15-min Arrival Reminder</p>
                    <p className="text-xs text-muted-foreground">Alert staff 15 minutes before arrival</p>
                  </div>
                </div>
                <button
                  onClick={() => setForm(p => ({ ...p, reminderEnabled: !p.reminderEnabled }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.reminderEnabled ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-muted/30 border-border text-muted-foreground'}`}
                >
                  {form.reminderEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                  {form.reminderEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.tableId || !form.guestName || !form.phone}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle size={14} />
                {editingId ? 'Update Booking' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved toast */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium shadow-xl fade-in">
          <CheckCircle size={15} />
          Booking saved
        </div>
      )}
    </div>
  );
}
