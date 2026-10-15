'use client';

import React, { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';
import LockModal from '@/components/LockModal';
import Link from 'next/link';
import { Plus, Edit2, Trash2, X, CheckCircle2, Layers, Save } from 'lucide-react';
import { zonesApi } from '@/lib/api/client';
import type { ZoneData, CreateZoneRequest, UpdateZoneRequest } from '@/lib/api/types';

const COLOR_PRESETS = [
  '#f59e0b', '#06b6d4', '#10b981', '#a855f7',
  '#f43f5e', '#3b82f6', '#ec4899', '#f97316',
];

interface ZoneFormData {
  label: string;
  description: string;
  color: string;
  canvasWidth: number;
  canvasHeight: number;
}

const EMPTY_FORM: ZoneFormData = {
  label: '',
  description: '',
  color: '#06b6d4',
  canvasWidth: 900,
  canvasHeight: 600,
};

export default function ZoneManagementPage() {
  const [lockOpen, setLockOpen] = useState(false);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneData | null>(null);
  const [form, setForm] = useState<ZoneFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Fetch zones from API ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    zonesApi.list()
      .then(data => { if (!cancelled) { setZones(data); setLoadError(null); } })
      .catch(err => { if (!cancelled) { setZones([]); setLoadError(err.message ?? 'Failed to load zones'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openCreate = () => {
    setEditingZone(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (zone: ZoneData) => {
    setEditingZone(zone);
    setForm({ label: zone.label, description: zone.description, color: zone.color, canvasWidth: zone.canvasWidth, canvasHeight: zone.canvasHeight });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    if (editingZone) {
      const payload: UpdateZoneRequest = {
        label: form.label,
        description: form.description,
        color: form.color,
        canvasWidth: form.canvasWidth,
        canvasHeight: form.canvasHeight,
      };
      try {
        const updated = await zonesApi.update(editingZone.id, payload);
        setZones(prev => prev.map(z => z.id === editingZone.id ? updated : z));
      } catch {
        setZones(prev => prev.map(z => z.id === editingZone.id
          ? { ...z, label: form.label, description: form.description, color: form.color, canvasWidth: form.canvasWidth, canvasHeight: form.canvasHeight }
          : z
        ));
      }
      showToast(`"${form.label}" updated`);
    } else {
      const payload: CreateZoneRequest = {
        label: form.label,
        description: form.description,
        color: form.color,
        canvasWidth: form.canvasWidth,
        canvasHeight: form.canvasHeight,
      };
      try {
        const created = await zonesApi.create(payload);
        setZones(prev => [...prev, created]);
      } catch {
        const newZone: ZoneData = {
          id: `zone-${Date.now()}`,
          label: form.label,
          description: form.description,
          color: form.color,
          tableCount: 0,
          capacity: 0,
          isActive: true,
          canvasWidth: form.canvasWidth,
          canvasHeight: form.canvasHeight,
        };
        setZones(prev => [...prev, newZone]);
      }
      showToast(`"${form.label}" zone created`);
    }
    setDrawerOpen(false);
  };

  const handleDelete = async (id: string) => {
    const zone = zones.find(z => z.id === id);
    try { await zonesApi.delete(id); } catch { /* optimistic */ }
    setZones(prev => prev.filter(z => z.id !== id));
    setDeleteConfirm(null);
    showToast(`"${zone?.label}" removed`);
  };

  const toggleActive = async (id: string) => {
    try {
      const updated = await zonesApi.toggleActive(id);
      setZones(prev => prev.map(z => z.id === id ? updated : z));
    } catch {
      setZones(prev => prev.map(z => z.id === id ? { ...z, isActive: !z.isActive } : z));
    }
  };

  const totalTables = zones.reduce((a, z) => a + z.tableCount, 0);
  const totalCapacity = zones.reduce((a, z) => a + z.capacity, 0);
  const activeZones = zones.filter(z => z.isActive).length;

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <TopNav onLockTerminal={() => setLockOpen(true)} />
      <LockModal isOpen={lockOpen} onClose={() => setLockOpen(false)} onUnlock={() => setLockOpen(false)} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-2xl"
          style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Layers size={18} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold text-foreground">Zones</h1>
              <p className="text-xs text-muted-foreground">Create, edit, and activate floor zones (canvas size, color)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/post-items"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              Back to Post Items
            </Link>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all"
              style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.35)', color: '#06b6d4' }}
            >
              <Plus size={13} />
              New Zone
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {[
            { label: 'Total Zones',    value: zones.length,  color: '#06b6d4', icon: '🗺️' },
            { label: 'Active Zones',   value: activeZones,   color: '#10b981', icon: '✅' },
            { label: 'Total Tables',   value: totalTables,   color: '#a855f7', icon: '🪑' },
            { label: 'Total Capacity', value: totalCapacity, color: '#f59e0b', icon: '👥' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-3 md:p-4 flex items-center gap-2 md:gap-3" style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.15)' }}>
              <div className="w-8 md:w-10 h-8 md:h-10 rounded-xl flex items-center justify-center text-base md:text-lg flex-shrink-0" style={{ background: `${s.color}18`, border: `1px solid ${s.color}30` }}>
                {s.icon}
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] md:text-[11px] text-muted-foreground font-medium">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Zone Cards Grid — 1 col on mobile, 2 on tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {zones.map(zone => (
            <div
              key={zone.id}
              className="rounded-2xl p-4 md:p-5 transition-all group"
              style={{
                background: 'rgba(15,23,42,0.8)',
                border: `1px solid ${zone.isActive ? zone.color + '30' : 'rgba(100,116,139,0.12)'}`,
                opacity: zone.isActive ? 1 : 0.6,
              }}
            >
              {/* Zone Header */}
              <div className="flex items-start justify-between mb-3 md:mb-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-9 md:w-10 h-9 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${zone.color}18`, border: `1.5px solid ${zone.color}40` }}>
                    <div className="w-3.5 md:w-4 h-3.5 md:h-4 rounded-full" style={{ background: zone.color, boxShadow: `0 0 10px ${zone.color}80` }} />
                  </div>
                  <div>
                    <h3 className="text-xs md:text-sm font-bold text-foreground">{zone.label}</h3>
                    <p className="text-[10px] md:text-[11px] text-muted-foreground mt-0.5 hidden sm:block">{zone.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 md:gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(zone)}
                    className="w-6 md:w-7 h-6 md:h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#06b6d4' }}
                  >
                    <Edit2 size={11} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(zone.id)}
                    className="w-6 md:w-7 h-6 md:h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Tables', value: zone.tableCount },
                  { label: 'Capacity', value: zone.capacity },
                  { label: 'Canvas', value: `${zone.canvasWidth}×${zone.canvasHeight}` },
                ].map(s => (
                  <div key={s.label} className="rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(100,116,139,0.1)' }}>
                    <p className="text-sm font-bold text-foreground">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Canvas Preview */}
              <div className="rounded-xl overflow-hidden mb-4" style={{ height: 60, background: 'rgba(10,22,40,0.8)', border: `1px solid ${zone.color}20`, position: 'relative' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `linear-gradient(${zone.color}08 1px, transparent 1px), linear-gradient(90deg, ${zone.color}08 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }} />
                <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: zone.color, opacity: 0.4 }}>
                  {zone.label}
                </div>
                {/* Mini table dots */}
                {Array.from({ length: Math.min(zone.tableCount, 8) }).map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    width: 8, height: 8, borderRadius: '50%',
                    background: zone.color,
                    opacity: 0.6,
                    left: 12 + (i % 4) * 22,
                    top: i < 4 ? 12 : 36,
                    boxShadow: `0 0 6px ${zone.color}`,
                  }} />
                ))}
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Zone Status</span>
                <button
                  onClick={() => toggleActive(zone.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={zone.isActive
                    ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }
                    : { background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#64748b' }
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${zone.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {zone.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          ))}

          {/* Add Zone Card */}
          <button
            onClick={openCreate}
            className="rounded-2xl p-5 flex flex-col items-center justify-center gap-3 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/5 group"
            style={{ background: 'rgba(15,23,42,0.4)', border: '1px dashed rgba(100,116,139,0.25)', minHeight: 200 }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <Plus size={20} style={{ color: '#06b6d4' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">Create New Zone</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add a new floor section</p>
            </div>
          </button>
        </div>
      </div>

      {/* Create/Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md flex flex-col" style={{ background: '#0d1b2e', borderLeft: '1px solid rgba(100,116,139,0.2)' }}>
            {/* Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
              <div>
                <h2 className="text-base font-bold text-foreground">{editingZone ? 'Edit Zone' : 'Create New Zone'}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{editingZone ? `Editing "${editingZone.label}"` : 'Define a new floor section'}</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Preview */}
              <div className="rounded-2xl overflow-hidden" style={{ height: 80, background: 'rgba(10,22,40,0.9)', border: `1.5px solid ${form.color}40`, position: 'relative' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `linear-gradient(${form.color}10 1px, transparent 1px), linear-gradient(90deg, ${form.color}10 1px, transparent 1px)`,
                  backgroundSize: '20px 20px',
                }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: form.color, boxShadow: `0 0 12px ${form.color}` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: form.color, letterSpacing: '0.06em' }}>{form.label || 'Zone Preview'}</span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>{form.canvasWidth} × {form.canvasHeight}px canvas</span>
                </div>
              </div>

              {/* Zone Name */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Zone Name *</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Rooftop Lounge"
                  className="w-full px-4 py-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief zone description"
                  className="w-full px-4 py-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Zone Color</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-8 h-8 rounded-xl transition-all"
                      style={{
                        background: c,
                        border: form.color === c ? `2px solid white` : '2px solid transparent',
                        boxShadow: form.color === c ? `0 0 12px ${c}` : 'none',
                        transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-8 h-8 rounded-xl cursor-pointer border-0 p-0"
                    style={{ background: 'transparent' }}
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Canvas Size */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Canvas Size (px)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-1">Width</label>
                    <input
                      type="number"
                      value={form.canvasWidth}
                      onChange={e => setForm(f => ({ ...f, canvasWidth: Number(e.target.value) }))}
                      min={600}
                      max={2400}
                      step={100}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground outline-none font-mono"
                      style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-1">Height</label>
                    <input
                      type="number"
                      value={form.canvasHeight}
                      onChange={e => setForm(f => ({ ...f, canvasHeight: Number(e.target.value) }))}
                      min={400}
                      max={1600}
                      step={100}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground outline-none font-mono"
                      style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Larger canvas = more space to drag tables freely</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-all"
                style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(100,116,139,0.2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.label.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.4)', color: '#06b6d4' }}
              >
                <Save size={14} />
                {editingZone ? 'Save Changes' : 'Create Zone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative rounded-2xl p-6 w-80 text-center" style={{ background: '#0d1b2e', border: '1px solid rgba(244,63,94,0.3)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)' }}>
              <Trash2 size={20} style={{ color: '#f43f5e' }} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Delete Zone?</h3>
            <p className="text-sm text-muted-foreground mb-5">All tables in this zone will be unassigned. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(100,116,139,0.2)' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.35)', color: '#f43f5e' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
