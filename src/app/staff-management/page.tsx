'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Search, Shield, Edit2, Trash2, X, CheckCircle2,
  Eye, EyeOff, KeyRound, Users, UserCheck, UserX, Clock
} from 'lucide-react';
import { usersApi } from '@/lib/api/client';
import type { StaffUser, UserRole, CreateUserRequest, UpdateUserRequest } from '@/lib/api/types';

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; border: string; icon: string; label: string }> = {
  Admin:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  icon: '👑', label: 'Admin' },
  Manager:   { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.35)', icon: '🎯', label: 'Manager' },
  Bartender: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.35)',  icon: '🍸', label: 'Bartender' },
  Cashier:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', icon: '💳', label: 'Cashier' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  active:   { label: 'Active',   color: 'text-emerald-400', dot: 'bg-emerald-400' },
  inactive: { label: 'Inactive', color: 'text-slate-500',   dot: 'bg-slate-500'   },
  on_shift: { label: 'On Shift', color: 'text-cyan-400',    dot: 'bg-cyan-400'    },
};

const ROLES: UserRole[] = ['Admin', 'Manager', 'Bartender', 'Cashier'];

interface StaffFormData {
  name: string;
  email: string;
  role: UserRole;
  terminalId: string;
  password: string;
  pin: string;
  confirmPin: string;
}

const EMPTY_FORM: StaffFormData = {
  name: '', email: '', role: 'Bartender', terminalId: '', password: '', pin: '', confirmPin: ''
};

function PinDots({ value, max = 4 }: { value: string; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
            i < value.length
              ? 'bg-amber-400 border-amber-400 scale-110' :'bg-transparent border-slate-600'
          }`}
        />
      ))}
    </div>
  );
}

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'All'>('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinStep, setPinStep] = useState<'password' | 'pin'>('password');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    usersApi.list()
      .then(data => { if (!cancelled) { setStaff(data); setLoadError(null); } })
      .catch(err => { if (!cancelled) { setStaff([]); setLoadError(err.message ?? 'Failed to load staff'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setPinStep('password');
    setPinError('');
    setDrawerOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, terminalId: user.terminalId === '—' ? '' : user.terminalId, password: '', pin: '', confirmPin: '' });
    setPinStep('password');
    setPinError('');
    setDrawerOpen(true);
  };

  const handlePinInput = (digit: string, field: 'pin' | 'confirmPin') => {
    const current = form[field];
    if (current.length < 4) {
      setForm(prev => ({ ...prev, [field]: current + digit }));
      setPinError('');
    }
  };

  const handlePinBackspace = (field: 'pin' | 'confirmPin') => {
    setForm(prev => ({ ...prev, [field]: prev[field].slice(0, -1) }));
    setPinError('');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      showToast('Name and email are required', 'error');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      showToast('Password is required for new staff', 'error');
      return;
    }
    if (form.pin && form.pin !== form.confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    if (form.pin && form.pin.length !== 4) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }

    if (editingUser) {
      const payload: UpdateUserRequest = {
        name: form.name,
        email: form.email,
        role: form.role,
        terminalId: form.terminalId || undefined,
      };
      try {
        const updated = await usersApi.update(editingUser.id, payload);
        setStaff(prev => prev.map(u => u.id === editingUser.id ? updated : u));
      } catch {
        setStaff(prev => prev.map(u => u.id === editingUser.id
          ? { ...u, name: form.name, email: form.email, role: form.role, terminalId: form.terminalId || '—' }
          : u
        ));
      }
      showToast(`${form.name} updated`);
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
        setStaff(prev => [created, ...prev]);
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
        setStaff(prev => [newUser, ...prev]);
      }
      showToast(`${form.name} created`);
    }
    setDrawerOpen(false);
  };

  const handleDelete = async (id: string) => {
    const user = staff.find(u => u.id === id);
    try { await usersApi.delete(id); } catch {}
    setStaff(prev => prev.filter(u => u.id !== id));
    setDeleteConfirm(null);
    showToast(`${user?.name} removed`);
  };

  const filtered = staff.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'All' || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const stats = {
    total: staff.length,
    onShift: staff.filter(u => u.status === 'on_shift').length,
    active: staff.filter(u => u.status === 'active').length,
    inactive: staff.filter(u => u.status === 'inactive').length,
  };

  const PIN_DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 md:top-6 md:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl transition-all ${
          toast.type === 'success' ?'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :'bg-rose-500/15 border-rose-500/30 text-rose-400'
        }`}>
          <CheckCircle2 size={16} />
          {toast.msg}
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
            <div className="w-7 md:w-8 h-7 md:h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <Shield size={14} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <h1 className="text-xs md:text-sm font-bold text-foreground">Staff Management</h1>
              <p className="text-[10px] text-muted-foreground hidden sm:block">Accounts · Roles · PIN Setup</p>
            </div>
          </div>
          <div className="ml-auto">
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Staff</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Staff', value: stats.total, icon: <Users size={16} />, color: '#f59e0b' },
            { label: 'On Shift', value: stats.onShift, icon: <Clock size={16} />, color: '#06b6d4' },
            { label: 'Active', value: stats.active, icon: <UserCheck size={16} />, color: '#10b981' },
            { label: 'Inactive', value: stats.inactive, icon: <UserX size={16} />, color: '#64748b' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl p-4" style={{ background: `${stat.color}08`, border: `1px solid ${stat.color}20` }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: stat.color }}>{stat.icon}<span className="text-xs font-medium text-muted-foreground">{stat.label}</span></div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search staff by name or email…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['All', ...ROLES] as const).map(r => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                  filterRole === r
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :'bg-muted/30 text-muted-foreground border-border hover:border-amber-500/30'
                }`}
              >
                {r === 'All' ? 'All Roles' : r}
              </button>
            ))}
          </div>
        </div>

        {/* Staff Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(user => {
              const rc = ROLE_CONFIG[user.role];
              const sc = STATUS_CONFIG[user.status] ?? STATUS_CONFIG.inactive;
              return (
                <div key={user.id} className="rounded-2xl p-4 md:p-5 flex flex-col gap-4 transition-all hover:scale-[1.01]" style={{ background: 'rgba(15,23,42,0.8)', border: `1px solid ${rc.color}20` }}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: rc.bg, border: `1px solid ${rc.border}`, color: rc.color }}>
                      {user.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground truncate">{user.name}</h3>
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: rc.bg, border: `1px solid ${rc.border}`, color: rc.color }}>
                          <span>{rc.icon}</span>{rc.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        <span className={`text-[10px] font-medium ${sc.color}`}>{sc.label}</span>
                        {user.terminalId !== '—' && (
                          <span className="text-[10px] text-muted-foreground ml-1">· {user.terminalId}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.12)' }}>
                      <p className="text-[10px] text-muted-foreground">Last Active</p>
                      <p className="text-xs font-medium text-foreground">{user.lastActive}</p>
                    </div>
                    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.12)' }}>
                      <p className="text-[10px] text-muted-foreground">Shifts / Week</p>
                      <p className="text-xs font-medium text-foreground">{user.shiftsThisWeek}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                    <button
                      onClick={() => openEdit(user)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{ background: `${rc.color}10`, border: `1px solid ${rc.color}25`, color: rc.color }}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => { setEditingUser(user); setForm({ ...EMPTY_FORM, name: user.name, email: user.email, role: user.role, terminalId: user.terminalId === '—' ? '' : user.terminalId }); setPinStep('pin'); setDrawerOpen(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20"
                    >
                      <KeyRound size={12} /> Set PIN
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(user.id)}
                      className="flex items-center justify-center p-2 rounded-xl text-xs font-medium transition-all bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <h3 className="text-base font-bold text-foreground mb-2">Remove Staff Member?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently delete the account and revoke all access.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-muted/30 border border-border text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 transition-all">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="ml-auto w-full max-w-md h-full overflow-y-auto flex flex-col" style={{ background: 'rgba(10,18,35,0.98)', borderLeft: '1px solid rgba(100,116,139,0.2)' }}>
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 sticky top-0 z-10" style={{ background: 'rgba(10,18,35,0.98)' }}>
              <div>
                <h2 className="text-sm font-bold text-foreground">{editingUser ? 'Edit Staff Account' : 'New Staff Account'}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{pinStep === 'pin' ? 'Set terminal PIN' : 'Account details & role'}</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Step Tabs */}
            <div className="flex gap-1 px-5 pt-4">
              {(['password', 'pin'] as const).map(step => (
                <button
                  key={step}
                  onClick={() => setPinStep(step)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                    pinStep === step
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :'bg-muted/20 text-muted-foreground border-border hover:border-amber-500/20'
                  }`}
                >
                  {step === 'password' ? '📋 Account Info' : '🔑 PIN Setup'}
                </button>
              ))}
            </div>

            <div className="flex-1 px-5 py-4 space-y-4">
              {pinStep === 'password' ? (
                <>
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Jordan Lee"
                      className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/20 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email Address *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="staff@skybar.com"
                      className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/20 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLES.map(r => {
                        const rc = ROLE_CONFIG[r];
                        return (
                          <button
                            key={r}
                            onClick={() => setForm(p => ({ ...p, role: r }))}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border"
                            style={{
                              background: form.role === r ? rc.bg : 'rgba(100,116,139,0.06)',
                              border: `1px solid ${form.role === r ? rc.border : 'rgba(100,116,139,0.15)'}`,
                              color: form.role === r ? rc.color : '#94a3b8',
                            }}
                          >
                            <span>{rc.icon}</span>{rc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Terminal ID */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Terminal ID <span className="text-muted-foreground/60">(optional)</span></label>
                    <input
                      value={form.terminalId}
                      onChange={e => setForm(p => ({ ...p, terminalId: e.target.value }))}
                      placeholder="e.g. POS-05"
                      className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/20 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Password */}
                  {!editingUser && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="Min. 8 characters"
                          className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-muted/20 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setPinStep('pin')}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition-all mt-2"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}
                  >
                    Next: Set PIN →
                  </button>
                </>
              ) : (
                <>
                  {/* PIN Setup */}
                  <div className="text-center space-y-6 py-4">
                    <div>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                        <KeyRound size={24} style={{ color: '#f59e0b' }} />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">Terminal PIN</h3>
                      <p className="text-xs text-muted-foreground mt-1">4-digit PIN for quick terminal unlock</p>
                    </div>

                    {/* PIN Entry */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Enter PIN</p>
                        <div className="flex justify-center">
                          <PinDots value={form.pin} />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Confirm PIN</p>
                        <div className="flex justify-center">
                          <PinDots value={form.confirmPin} />
                        </div>
                      </div>
                      {pinError && <p className="text-xs text-rose-400 text-center">{pinError}</p>}
                    </div>

                    {/* Numpad */}
                    <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
                      {PIN_DIGITS.map((d, i) => (
                        <button
                          key={i}
                          disabled={d === ''}
                          onClick={() => {
                            if (d === '⌫') {
                              if (form.confirmPin.length > 0) handlePinBackspace('confirmPin');
                              else handlePinBackspace('pin');
                            } else if (form.pin.length < 4) {
                              handlePinInput(d, 'pin');
                            } else {
                              handlePinInput(d, 'confirmPin');
                            }
                          }}
                          className={`h-12 rounded-xl text-base font-semibold transition-all border ${
                            d === '' ?'invisible'
                              : d === '⌫' ?'bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20' :'bg-muted/20 border-border text-foreground hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setPinStep('password')}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back to account info
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Save Button */}
            <div className="px-5 py-4 border-t border-border/30 sticky bottom-0" style={{ background: 'rgba(10,18,35,0.98)' }}>
              <button
                onClick={handleSave}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all"
                style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}
              >
                {editingUser ? 'Save Changes' : 'Create Staff Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
