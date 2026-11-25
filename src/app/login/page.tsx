'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { ShieldCheck, Coffee, CreditCard, LayoutGrid, ClipboardList, Wallet, ConciergeBell, ChevronRight, User, Lock } from 'lucide-react';
import PinPad from '@/components/PinPad';
import { staffApi, authApi } from '@/lib/api/client';
import { persistLoginSession } from '@/lib/api/config';
import { registerStaffNames } from '@/lib/staffDisplay';
import type { StaffUser, UserRole } from '@/lib/api/types';

const ROLE_CONFIG: Record<UserRole, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  Admin: { icon: <ShieldCheck size={13} />, color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  Manager: { icon: <LayoutGrid size={13} />, color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  Supervisor: { icon: <ClipboardList size={13} />, color: 'text-indigo-400', bg: 'bg-indigo-500/15', border: 'border-indigo-500/30' },
  Finance: { icon: <Wallet size={13} />, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  Service: { icon: <ConciergeBell size={13} />, color: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/30' },
  Bartender: { icon: <Coffee size={13} />, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  Cashier: { icon: <CreditCard size={13} />, color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
};

function saveSession(
  loginResult: { token: string; user?: StaffUser },
  fallback: StaffUser,
) {
  const user = loginResult.user ?? fallback;
  persistLoginSession(loginResult.token, {
    id: user.id,
    name: user.name,
    role: user.role,
    terminalId: user.terminalId,
    avatar: user.avatar,
  });
  registerStaffNames({ [user.id]: user.name });
}

export default function LoginPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      staffApi.list()
        .then((list) => {
          if (cancelled) return;
          setStaffList(Array.isArray(list) ? list : []);
          registerStaffNames(Object.fromEntries((list ?? []).map((s) => [s.id, s.name])));
        })
        .catch(() => {
          if (!cancelled) setStaffList((current) => current);
        })
        .finally(() => {
          if (!cancelled) setLoadingStaff(false);
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const failPin = (message: string) => {
    setError(message);
    setShake(true);
    setTimeout(() => { setShake(false); setPin(''); }, 600);
  };

  const tryLogin = async (staff: StaffUser, enteredPin: string) => {
    if (submittingRef.current || success) return;
    if (!/^\d{4,6}$/.test(enteredPin)) {
      failPin('Enter the full PIN (4 to 6 digits), then press Sign in.');
      return;
    }
    submittingRef.current = true;
    try {
      const pinResult = await staffApi.verifyPin(staff.id, { pin: enteredPin });
      if (!(pinResult.success || pinResult.valid)) {
        failPin(pinResult.message || 'Incorrect PIN. Ask a manager to reset it.');
        return;
      }
      const loginResult = await authApi.login({
        email: staff.email,
        password: enteredPin,
      });
      saveSession(loginResult, staff);
      setSuccess(true);
      const home = (loginResult.user?.role ?? staff.role) === 'Finance' ? '/reports' : '/';
      setTimeout(() => router.push(home), 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/invalid credentials|invalid pin/i.test(message)) {
        failPin('Incorrect PIN. Ask a manager to reset it.');
      } else if (/too many/i.test(message)) {
        failPin('Too many tries. Wait a minute, then press Sign in.');
      } else if (message) {
        failPin(message);
      } else {
        failPin('Cannot reach the server. Wait a moment and press Sign in.');
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSelectStaff = (staff: StaffUser) => {
    setSelectedStaff(staff);
    setPin('');
    setError('');
    setSuccess(false);
    submittingRef.current = false;
  };

  const handleBack = () => {
    setSelectedStaff(null);
    setPin('');
    setError('');
    setSuccess(false);
    submittingRef.current = false;
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-start sm:justify-center p-4 py-8 relative overflow-x-hidden overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-3">
            <AppLogo size={40} />
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">NAKNAK POS</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40 border border-border text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            <span>System Online</span>
            {timeStr && <span className="text-foreground font-mono font-medium ml-1">{timeStr}</span>}
          </div>
        </div>

        {!selectedStaff ? (
          <div className="glass-card-elevated rounded-2xl border border-border p-6 slide-up">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <User size={15} className="text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Select Your Profile</h2>
                <p className="text-xs text-muted-foreground">Choose your staff account to continue</p>
              </div>
            </div>

            {loadingStaff ? (
              <p className="text-center text-sm text-muted-foreground py-8">Loading staff...</p>
            ) : staffList.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No staff accounts found. Contact your manager if this continues.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {staffList.map(staff => {
                  const roleConf = ROLE_CONFIG[staff.role];
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => handleSelectStaff(staff)}
                      className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all duration-200 touch-manipulation"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-lg font-bold text-foreground">
                        {staff.avatar}
                      </div>
                      <div className="text-center min-w-0 w-full">
                        <p className="text-sm font-semibold text-foreground truncate">{staff.name}</p>
                        <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${roleConf.bg} ${roleConf.color} ${roleConf.border}`}>
                          {roleConf.icon}
                          {staff.role}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-start justify-center slide-up pb-8">
            <div className="glass-card-elevated rounded-2xl border border-border p-5 w-full sm:w-56 flex-shrink-0">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center text-xl font-bold">
                  {selectedStaff.avatar}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selectedStaff.name}</p>
                  <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_CONFIG[selectedStaff.role].bg} ${ROLE_CONFIG[selectedStaff.role].color} ${ROLE_CONFIG[selectedStaff.role].border}`}>
                    {ROLE_CONFIG[selectedStaff.role].icon}
                    {selectedStaff.role}
                  </div>
                </div>
                <button type="button" onClick={handleBack} className="w-full mt-1 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted/40 transition-all touch-manipulation">
                  ← Change Staff
                </button>
              </div>
            </div>

            <div className="glass-card-elevated rounded-2xl border border-border p-6 w-full sm:w-72">
              <div className="flex items-center gap-2 mb-5">
                <Lock size={14} className="text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Enter PIN</h3>
                  <p className="text-xs text-muted-foreground">Enter all 4 to 6 digits, then press Sign in</p>
                </div>
              </div>

              <div className={`flex justify-center gap-4 mb-5 ${shake ? 'animate-bounce' : ''}`}>
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div
                    key={`pin-dot-${i}`}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      success ? 'bg-emerald-400 border-emerald-400' : i < pin.length ? 'bg-primary border-primary neon-cyan' : 'border-border bg-transparent'
                    }`}
                  />
                ))}
              </div>

              {error && <p className="text-center text-xs text-rose-400 mb-3">{error}</p>}
              {success && <p className="text-center text-xs text-emerald-400 mb-3">✓ Access granted — loading...</p>}

              <PinPad
                value={pin}
                maxLength={6}
                disabled={success}
                onChange={(next) => {
                  setPin(next.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
              />
              <button
                type="button"
                disabled={success || pin.length < 4}
                onClick={() => { void tryLogin(selectedStaff, pin); }}
                className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
