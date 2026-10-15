'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import { CalendarRange, Plus, ChevronLeft, ChevronRight, Clock, MapPin, Edit3, Trash2, X, CheckCircle, Users, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { zonesApi, rosterApi } from '@/lib/api/client';
import type {
  AvailabilityStatus,
  ShiftType,
  StaffAvailability,
  StaffShift,
  ZoneData,
} from '@/lib/api/types';

function staffAvatar(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const SHIFT_COLORS: Record<ShiftType, { bg: string; text: string; border: string }> = {
  Morning:   { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  Afternoon: { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', border: 'rgba(16,185,129,0.35)' },
  Evening:   { bg: 'rgba(6,182,212,0.15)',   text: '#06b6d4', border: 'rgba(6,182,212,0.35)' },
  Night:     { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7', border: 'rgba(168,85,247,0.35)' },
};

const AVAIL_STYLES: Record<AvailabilityStatus, { bg: string; text: string; label: string }> = {
  available:   { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', label: 'Available' },
  partial:     { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', label: 'Partial' },
  unavailable: { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444', label: 'Off' },
};

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMPTY_FORM = { staffId: '', date: '', startTime: '18:00', endTime: '02:00', zoneId: '', shiftType: 'Evening' as ShiftType, notes: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay(); // 0=Sun
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDisplay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WeeklyRosterPage() {
  const [isLocked, setIsLocked] = useState(false);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'grid' | 'availability'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');
  const [filterZone, setFilterZone] = useState('all');

  const weekDates = getWeekDates(weekAnchor);
  const weekStart = fmtDate(weekDates[0]);
  const weekEnd = fmtDate(weekDates[6]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      rosterApi.shifts({ weekStart }),
      rosterApi.availability(),
      zonesApi.list(),
    ])
      .then(([shiftData, availData, zoneData]) => {
        if (cancelled) return;
        setShifts(shiftData);
        setAvailability(availData);
        setZones(zoneData);
        setLoadError(null);
      })
      .catch(err => {
        if (!cancelled) {
          setShifts([]);
          setAvailability([]);
          setZones([]);
          setLoadError(err.message ?? 'Failed to load roster');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  const prevWeek = () => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); };
  const nextWeek = () => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); };

  const getZone = (id: string) => zones.find(z => z.id === id);

  const shiftsInWeek = shifts.filter(s => s.date >= weekStart && s.date <= weekEnd);

  const filteredShifts = shiftsInWeek.filter(s => {
    const matchSearch = s.staffName.toLowerCase().includes(search.toLowerCase());
    const matchZone = filterZone === 'all' || s.zoneId === filterZone;
    return matchSearch && matchZone;
  });

  // Build grid: staffId -> dateStr -> shifts[]
  const gridData: Record<string, Record<string, StaffShift[]>> = {};
  const staffInWeek = [...new Set(filteredShifts.map(s => s.staffId))];
  staffInWeek.forEach(sid => {
    gridData[sid] = {};
    weekDates.forEach(d => { gridData[sid][fmtDate(d)] = []; });
    filteredShifts.filter(s => s.staffId === sid).forEach(s => {
      if (gridData[sid][s.date]) gridData[sid][s.date].push(s);
    });
  });

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (s: StaffShift) => {
    setForm({ staffId: s.staffId, date: s.date, startTime: s.startTime, endTime: s.endTime, zoneId: s.zoneId, shiftType: s.shiftType, notes: s.notes || '' });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.staffId || !form.date || !form.zoneId) return;
    setFormError(null);
    const payload = {
      staffId: form.staffId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      zoneId: form.zoneId,
      shiftType: form.shiftType,
      kdsAssigned: false,
      notes: form.notes || undefined,
    };
    try {
      if (editingId) {
        const updated = await rosterApi.updateShift(editingId, payload);
        setShifts(prev => prev.map(s => (s.id === editingId ? updated : s)));
      } else {
        const created = await rosterApi.createShift(payload);
        setShifts(prev => [created, ...prev]);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save shift');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await rosterApi.deleteShift(id);
      setShifts(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete shift');
    }
  };

  const toggleAvailability = async (staffId: string, day: string) => {
    const row = availability.find(a => a.staffId === staffId);
    if (!row) return;
    const cur = row.weeklyAvailability[day] ?? 'unavailable';
    const next: AvailabilityStatus = cur === 'available' ? 'partial' : cur === 'partial' ? 'unavailable' : 'available';
    const weeklyAvailability = { ...row.weeklyAvailability, [day]: next };
    try {
      const updated = await rosterApi.updateAvailability(staffId, { weeklyAvailability });
      setAvailability(prev => prev.map(a => (a.staffId === staffId ? updated : a)));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update availability');
    }
  };

  const totalShiftsThisWeek = shiftsInWeek.length;
  const uniqueStaffCount = new Set(shiftsInWeek.map(s => s.staffId)).size;
  const eveningShifts = shiftsInWeek.filter(s => s.shiftType === 'Evening' || s.shiftType === 'Late').length;

  return (
    <div className="min-h-screen bg-background">
      <TopNav onLockTerminal={() => setIsLocked(true)} />
      {isLocked && <LockModal onUnlock={() => setIsLocked(false)} />}

      <div className="max-w-7xl mx-auto px-3 md:px-4 lg:px-6 py-4 md:py-6 space-y-4 md:space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <CalendarRange size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-foreground">Weekly Roster</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="p-2 rounded-lg bg-muted/40 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
              <ChevronLeft size={16} />
            </button>
            <button onClick={nextWeek} className="p-2 rounded-lg bg-muted/40 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
              <ChevronRight size={16} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add </span>Shift
            </button>
          </div>
        </div>

        {(loadError || formError) && (
          <p className="text-sm text-rose-400 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2">
            {loadError ?? formError}
          </p>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground px-1">Loading roster from API…</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            { label: 'Shifts This Week', value: totalShiftsThisWeek, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Staff Scheduled', value: uniqueStaffCount, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
            { label: 'Evening / Late', value: eveningShifts, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          ].map(s => (
            <div key={s.label} className={`glass-card rounded-xl border p-3 md:p-4 ${s.bg}`}>
              <p className={`text-xl md:text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted/30 border border-border rounded-xl w-fit">
          {(['grid', 'availability'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'grid' ? 'Shift Grid' : 'Availability'}
            </button>
          ))}
        </div>

        {/* Filters (grid tab only) */}
        {activeTab === 'grid' && (
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-36 md:min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff…"
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
          </div>
        )}

        {/* ── SHIFT GRID TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'grid' && (
          <div className="glass-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36 bg-muted/20">Staff</th>
                    {weekDates.map(d => (
                      <th key={fmtDate(d)} className="text-center px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 min-w-[110px]">
                        <span className="block">{DAYS_OF_WEEK[weekDates.indexOf(d)]}</span>
                        <span className="block text-[10px] font-normal text-muted-foreground/60 mt-0.5">{fmtDisplay(d)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffInWeek.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        No shifts scheduled this week
                      </td>
                    </tr>
                  ) : (
                    staffInWeek.map(staffId => {
                      const staffInfo = availability.find(a => a.staffId === staffId);
                      return (
                        <tr key={staffId} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                          {/* Staff cell */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                {staffInfo ? staffAvatar(staffInfo.staffName) : '??'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{staffInfo?.staffName}</p>
                                <p className="text-[10px] text-muted-foreground">{staffInfo?.role}</p>
                              </div>
                            </div>
                          </td>
                          {/* Day cells */}
                          {weekDates.map(d => {
                            const dateStr = fmtDate(d);
                            const dayShifts = gridData[staffId]?.[dateStr] || [];
                            return (
                              <td key={dateStr} className="px-1.5 py-2 align-top">
                                <div className="space-y-1">
                                  {dayShifts.map(shift => {
                                    const zone = getZone(shift.zoneId);
                                    const sc = SHIFT_COLORS[shift.shiftType];
                                    return (
                                      <div
                                        key={shift.id}
                                        className="rounded-lg px-2 py-1.5 text-[10px] cursor-pointer group relative"
                                        style={{ background: sc.bg, border: `1px solid ${sc.border}` }}
                                        onClick={() => openEdit(shift)}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-bold truncate" style={{ color: sc.text }}>{shift.startTime}–{shift.endTime}</span>
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={e => { e.stopPropagation(); openEdit(shift); }}
                                              className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                                            >
                                              <Edit3 size={9} />
                                            </button>
                                            {deleteConfirm === shift.id ? (
                                              <>
                                                <button onClick={e => { e.stopPropagation(); handleDelete(shift.id); }} className="px-1 py-0.5 rounded bg-rose-500 text-white text-[9px]">Del</button>
                                                <button onClick={e => { e.stopPropagation(); setDeleteConfirm(null); }} className="px-1 py-0.5 rounded text-muted-foreground text-[9px]">No</button>
                                              </>
                                            ) : (
                                              <button
                                                onClick={e => { e.stopPropagation(); setDeleteConfirm(shift.id); }}
                                                className="p-0.5 rounded text-muted-foreground hover:text-rose-400"
                                              >
                                                <Trash2 size={9} />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <MapPin size={8} className="text-muted-foreground flex-shrink-0" />
                                          <span className="text-muted-foreground truncate" style={{ color: zone?.color }}>{zone?.label.split(' ')[0]}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {dayShifts.length === 0 && (
                                    <button
                                      onClick={() => { setForm({ ...EMPTY_FORM, staffId, date: dateStr }); setEditingId(null); setShowForm(true); }}
                                      className="w-full h-8 rounded-lg border border-dashed border-border/40 text-muted-foreground/30 hover:border-primary/30 hover:text-primary/40 transition-all flex items-center justify-center"
                                    >
                                      <Plus size={10} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 px-4 py-3 border-t border-border/50 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Shift types:</span>
              {(Object.entries(SHIFT_COLORS) as [ShiftType, typeof SHIFT_COLORS[ShiftType]][]).map(([type, sc]) => (
                <span key={type} className="flex items-center gap-1.5 text-xs" style={{ color: sc.text }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: sc.bg, border: `1px solid ${sc.border}` }} />
                  {type}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── AVAILABILITY TAB ───────────────────────────────────────────────── */}
        {activeTab === 'availability' && (
          <div className="space-y-3">
            {availability.map(staff => (
              <div key={staff.staffId} className="glass-card rounded-xl border border-border p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  {/* Staff info */}
                  <div className="flex items-center gap-2.5 w-40 flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                      {staffAvatar(staff.staffName)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{staff.staffName}</p>
                      <p className="text-xs text-muted-foreground">{staff.role}</p>
                    </div>
                  </div>

                  {/* Day availability toggles */}
                  <div className="flex items-center gap-1.5 flex-wrap flex-1">
                    {DAYS_OF_WEEK.map(day => {
                      const status = staff.weeklyAvailability[day] || 'unavailable';
                      const style = AVAIL_STYLES[status];
                      return (
                        <button
                          key={day}
                          onClick={() => toggleAvailability(staff.staffId, day)}
                          className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border transition-all hover:opacity-80"
                          style={{ background: style.bg, borderColor: style.text + '40', color: style.text }}
                          title={`${day}: ${style.label} — click to cycle`}
                        >
                          <span className="text-[10px] font-bold">{day}</span>
                          <span className="text-[9px] opacity-80">{style.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border">
                      <MapPin size={11} className="text-muted-foreground" />
                      <span className="text-xs text-foreground">{zones.find(z => z.id === staff.preferredZone)?.label.split(' ')[0] || staff.preferredZone}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Availability legend */}
            <div className="flex items-center gap-4 px-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Click day to cycle:</span>
              {(Object.entries(AVAIL_STYLES) as [AvailabilityStatus, typeof AVAIL_STYLES[AvailabilityStatus]][]).map(([status, style]) => (
                <span key={status} className="flex items-center gap-1.5 text-xs" style={{ color: style.text }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: style.bg }} />
                  {style.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SHIFT FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-md shadow-2xl fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editingId ? 'Edit Shift' : 'Add Shift'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Staff */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <Users size={11} className="inline mr-1" />Staff Member *
                </label>
                <select
                  value={form.staffId}
                  onChange={e => setForm(p => ({ ...p, staffId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Select staff…</option>
                  {availability.map(a => (
                    <option key={a.staffId} value={a.staffId}>{a.staffName} ({a.role})</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Start / End */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                    <Clock size={11} className="inline mr-1" />Start Time
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Zone */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                  <MapPin size={11} className="inline mr-1" />Assigned Zone
                </label>
                <select
                  value={form.zoneId}
                  onChange={e => setForm(p => ({ ...p, zoneId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>

              {/* Shift Type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Shift Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Morning', 'Afternoon', 'Evening', 'Night'] as ShiftType[]).map(type => {
                    const sc = SHIFT_COLORS[type];
                    return (
                      <button
                        key={type}
                        onClick={() => setForm(p => ({ ...p, shiftType: type }))}
                        className="py-2 rounded-lg text-xs font-medium border transition-all"
                        style={form.shiftType === type ? { background: sc.bg, borderColor: sc.border, color: sc.text } : { background: 'transparent', borderColor: 'rgba(100,116,139,0.2)', color: '#64748b' }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Opening manager, cover for Jordan…"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
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
                disabled={!form.staffId || !form.date}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle size={14} />
                {editingId ? 'Update Shift' : 'Add Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved toast */}
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium shadow-xl fade-in">
          <CheckCircle size={15} />
          Shift saved
        </div>
      )}
    </div>
  );
}
