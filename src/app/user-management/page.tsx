'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, User, Edit2, Trash2, X, CheckCircle2, Eye, EyeOff, Zap } from 'lucide-react';
import { usersApi } from '@/lib/api/client';
import type { StaffUser, UserRole, UserStatus, CreateUserRequest, UpdateUserRequest } from '@/lib/api/types';

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; border: string; icon: string }> = {
  Admin:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', icon: '👑' },
  Manager:   { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.35)', icon: '🎯' },
  Bartender: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.35)',  icon: '🍸' },
  Cashier:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', icon: '💳' },
};

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; dot: string }> = {
  active:   { label: 'Active',    color: 'text-emerald-400', dot: 'bg-emerald-400' },
  inactive: { label: 'Inactive',  color: 'text-slate-500',   dot: 'bg-slate-500'   },
  on_shift: { label: 'On Shift',  color: 'text-cyan-400',    dot: 'bg-cyan-400'    },
};

const ROLES: UserRole[] = ['Admin', 'Manager', 'Bartender', 'Cashier'];

interface UserFormData {
  name: string;
  email: string;
  role: UserRole;
  terminalId: string;
  password: string;
}

const EMPTY_FORM: UserFormData = { name: '', email: '', role: 'Bartender', terminalId: '', password: '' };

export default function UserManagementPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'All'>('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Fetch users from API ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    usersApi.list()
      .then(data => { if (!cancelled) { setUsers(data); setLoadError(null); } })
      .catch(err => { if (!cancelled) { setUsers([]); setLoadError(err.message ?? 'Failed to load users'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, terminalId: user.terminalId === '—' ? '' : user.terminalId, password: '' });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (editingUser) {
      const payload: UpdateUserRequest = {
        name: form.name,
        email: form.email,
        role: form.role,
        terminalId: form.terminalId || undefined,
      };
      try {
        const updated = await usersApi.update(editingUser.id, payload);
        setUsers(prev => prev.map(u => u.id === editingUser.id ? updated : u));
      } catch {
        setUsers(prev => prev.map(u => u.id === editingUser.id
          ? { ...u, name: form.name, email: form.email, role: form.role, terminalId: form.terminalId || '—' }
          : u
        ));
      }
      showToast(`${form.name} updated successfully`);
    } else {
      const payload: CreateUserRequest = {
        name: form.name,
        email: form.email,
        role: form.role,
        terminalId: form.terminalId || undefined,
        password: form.password,
      };
      try {
        const created = await usersApi.create(payload);
        setUsers(prev => [created, ...prev]);
      } catch {
        const newUser: StaffUser = {
          id: `u${Date.now()}`,
          name: form.name,
          email: form.email,
          role: form.role,
          status: 'inactive',
          terminalId: form.terminalId || '—',
          avatar: form.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          joinDate: new Date().toISOString().split('T')[0],
          lastActive: 'Never',
          shiftsThisWeek: 0,
        };
        setUsers(prev => [newUser, ...prev]);
      }
      showToast(`${form.name} created successfully`);
    }
    setDrawerOpen(false);
  };

  const handleDelete = async (id: string) => {
    const user = users.find(u => u.id === id);
    try { await usersApi.delete(id); } catch { /* optimistic */ }
    setUsers(prev => prev.filter(u => u.id !== id));
    setDeleteConfirm(null);
    showToast(`${user?.name} removed`);
  };

  const toggleStatus = async (id: string) => {
    try {
      const updated = await usersApi.toggleStatus(id);
      setUsers(prev => prev.map(u => u.id === id ? updated : u));
    } catch {
      setUsers(prev => prev.map(u =>
        u.id === id ? { ...u, status: u.status === 'inactive' ? 'active' : 'inactive' as UserStatus } : u
      ));
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'All' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    onShift: users.filter(u => u.status === 'on_shift').length,
    active: users.filter(u => u.status === 'active').length,
    inactive: users.filter(u => u.status === 'inactive').length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium shadow-2xl animate-fade-in">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'rgba(15,23,42,0.95)', borderBottom: '1px solid rgba(100,116,139,0.15)', backdropFilter: 'blur(20px)' }} className="sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ArrowLeft size={16} />
            <span className="text-sm hidden sm:inline">Back to Floor</span>
          </Link>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 md:w-8 h-7 md:h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
              <User size={14} style={{ color: '#a855f7' }} />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-foreground">User Management</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Staff accounts & permissions</p>
            </div>
          </div>
          <div className="ml-auto">
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}
            >
              <Plus size={13} />
              <span className="hidden sm:inline">New </span>User
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {[
            { label: 'Total Staff', value: stats.total, color: '#a855f7', icon: '👥' },
            { label: 'On Shift',    value: stats.onShift, color: '#06b6d4', icon: '⚡' },
            { label: 'Active',      value: stats.active,  color: '#10b981', icon: '✅' },
            { label: 'Inactive',    value: stats.inactive, color: '#64748b', icon: '💤' },
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

        {/* Filters */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-36 md:min-w-48" style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}>
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
            />
          </div>
          <div className="flex gap-1 md:gap-1.5 flex-wrap">
            {(['All', ...ROLES] as const).map(r => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className="px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all"
                style={filterRole === r
                  ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }
                  : { background: 'transparent', border: '1px solid rgba(100,116,139,0.2)', color: '#64748b' }
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Users Table — scrollable on tablet */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(100,116,139,0.15)' }}>
          <div className="px-4 md:px-5 py-3 border-b" style={{ borderColor: 'rgba(100,116,139,0.12)', background: 'rgba(30,41,59,0.4)' }}>
            <div className="grid grid-cols-10 md:grid-cols-12 gap-3 md:gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <div className="col-span-4">Staff Member</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2 hidden md:block">Status</div>
              <div className="col-span-2 hidden md:block">Terminal</div>
              <div className="col-span-4 md:col-span-2 text-right">Actions</div>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(100,116,139,0.08)' }}>
            {filtered.length === 0 ? (
              <div className="py-12 md:py-16 text-center text-muted-foreground text-sm">No staff found</div>
            ) : filtered.map(user => {
              const roleCfg = ROLE_CONFIG[user.role];
              const statusCfg = STATUS_CONFIG[user.status];
              return (
                <div key={user.id} className="px-4 md:px-5 py-3 md:py-4 grid grid-cols-10 md:grid-cols-12 gap-3 md:gap-4 items-center hover:bg-white/[0.02] transition-colors group">
                  {/* Staff Member */}
                  <div className="col-span-4 flex items-center gap-2 md:gap-3">
                    <div className="w-8 md:w-9 h-8 md:h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: roleCfg.bg, border: `1px solid ${roleCfg.border}`, color: roleCfg.color }}>
                      {user.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  {/* Role */}
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                      style={{ background: roleCfg.bg, border: `1px solid ${roleCfg.border}`, color: roleCfg.color }}>
                      {roleCfg.icon} {user.role}
                    </span>
                  </div>
                  {/* Status */}
                  <div className="col-span-2 hidden md:block">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${user.status === 'on_shift' ? 'animate-pulse' : ''}`} />
                      <span className={`text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{user.lastActive}</p>
                  </div>
                  {/* Terminal */}
                  <div className="col-span-2 hidden md:block">
                    <span className="text-xs font-mono text-muted-foreground">{user.terminalId}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{user.shiftsThisWeek} shifts/wk</p>
                  </div>
                  {/* Actions */}
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(user)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#06b6d4' }}
                      title="Edit user"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => toggleStatus(user.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}
                      title={user.status === 'inactive' ? 'Activate' : 'Deactivate'}
                    >
                      <Zap size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(user.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e' }}
                      title="Delete user"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create/Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md flex flex-col" style={{ background: '#0d1b2e', borderLeft: '1px solid rgba(100,116,139,0.2)' }}>
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(100,116,139,0.15)' }}>
              <div>
                <h2 className="text-base font-bold text-foreground">{editingUser ? 'Edit Staff Member' : 'Create New User'}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{editingUser ? `Editing ${editingUser.name}` : 'Add a new staff account'}</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Avatar Preview */}
              <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(100,116,139,0.15)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold"
                  style={{ background: ROLE_CONFIG[form.role].bg, border: `2px solid ${ROLE_CONFIG[form.role].border}`, color: ROLE_CONFIG[form.role].color }}>
                  {form.name ? form.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{form.name || 'New Staff Member'}</p>
                  <p className="text-xs text-muted-foreground">{form.email || 'email@skybar.com'}</p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{ background: ROLE_CONFIG[form.role].bg, color: ROLE_CONFIG[form.role].color }}>
                    {ROLE_CONFIG[form.role].icon} {form.role}
                  </span>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alex Miller"
                  className="w-full px-4 py-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="staff@skybar.com"
                  className="w-full px-4 py-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Role & Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => {
                    const cfg = ROLE_CONFIG[r];
                    return (
                      <button
                        key={r}
                        onClick={() => setForm(f => ({ ...f, role: r }))}
                        className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left"
                        style={form.role === r
                          ? { background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color }
                          : { background: 'rgba(30,41,59,0.4)', border: '1px solid rgba(100,116,139,0.15)', color: '#64748b' }
                        }
                      >
                        <span>{cfg.icon}</span>
                        <span>{r}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Terminal ID */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Terminal ID</label>
                <input
                  type="text"
                  value={form.terminalId}
                  onChange={e => setForm(f => ({ ...f, terminalId: e.target.value }))}
                  placeholder="e.g. POS-05"
                  className="w-full px-4 py-3 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all font-mono"
                  style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                />
              </div>

              {/* Password */}
              {!editingUser && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">PIN / Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="4-digit PIN or password"
                      className="w-full px-4 py-3 pr-10 rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                      style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(100,116,139,0.2)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}
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
                disabled={!form.name.trim() || !form.email.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}
              >
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative rounded-2xl p-6 w-80 text-center" style={{ background: '#0d1b2e', border: '1px solid rgba(244,63,94,0.3)' }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)' }}>
              <Trash2 size={20} style={{ color: '#f43f5e' }} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Remove Staff Member?</h3>
            <p className="text-sm text-muted-foreground mb-5">This action cannot be undone. The user will lose all access.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(100,116,139,0.2)' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.35)', color: '#f43f5e' }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
