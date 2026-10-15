'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { ShieldCheck, Coffee, CreditCard, LayoutGrid, Delete, ChevronRight, User, Lock } from 'lucide-react';
import { staffApi, authApi } from '@/lib/api/client';
import { persistLoginSession } from '@/lib/api/config';
import { registerStaffNames } from '@/lib/staffDisplay';
import type { StaffUser, UserRole } from '@/lib/api/types';

const ROLE_CONFIG: Record<UserRole, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  Admin: { icon: <ShieldCheck size={13} />, color: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  Manager: { icon: <LayoutGrid size={13} />, color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
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

  useEffect(() => {
    staffApi.list()
      .then((list) => {
        setStaffList(list);
        registerStaffNames(Object.fromEntries(list.map((s) => [s.id, s.name])));
      })
      .catch(() => setStaffList([]))
      .finally(() => setLoadingStaff(false));
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

  const handleSelectStaff = (staff: StaffUser) => {
    setSelectedStaff(staff);
    setPin('');
    setError('');
  };

  const handleKey = (key: string) => {
    if (pin.length >= 4 || !selectedStaff) return;
    const newPin = pin + key;
    setPin(newPin);
    setError('');
    if (newPin.length === 4) {
      setTimeout(async () => {
        try {
          const pinResult = await staffApi.verifyPin(selectedStaff.id, { pin: newPin });
          if (pinResult.success || pinResult.valid) {
            const loginResult = await authApi.login({
              email: selectedStaff.email,
              password: newPin,
            });
            saveSession(loginResult, selectedStaff);
            setSuccess(true);
            setTimeout(() => router.push('/'), 800);
            return;
          }
        } catch {
          /* try email login only below */
        }

        try {
          const loginResult = await authApi.login({
            email: selectedStaff.email,
            password: newPin,
          });
          saveSession(loginResult, selectedStaff);
          setSuccess(true);
          setTimeout(() => router.push('/'), 800);
        } catch {
          setError('Incorrect PIN. Try again.');
          setShake(true);
          setTimeout(() => { setShake(false); setPin(''); }, 600);
        }
      }, 120);
    }
  };

  const handleBack = () => {
    setSelectedStaff(null);
    setPin('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-3">
            <AppLogo size={40} />
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">SkyBar POS</h1>
              <p className="text-sm text-muted-foreground">Rooftop Lounge — Point of Sale</p>
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
              <p className="text-center text-sm text-muted-foreground py-8">No staff accounts found. Check backend connection.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {staffList.map(staff => {
                  const roleConf = ROLE_CONFIG[staff.role];
                  return (
                    <button
                      key={staff.id}
                      onClick={() => handleSelectStaff(staff)}
                      className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all duration-200"
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
          <div className="flex flex-col sm:flex-row gap-4 items-start justify-center slide-up">
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
                <button onClick={handleBack} className="w-full mt-1 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted/40 transition-all">
                  ← Change Staff
                </button>
              </div>
            </div>

            <div className="glass-card-elevated rounded-2xl border border-border p-6 w-full sm:w-72">
              <div className="flex items-center gap-2 mb-5">
                <Lock size={14} className="text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Enter PIN</h3>
                  <p className="text-xs text-muted-foreground">4-digit staff PIN</p>
                </div>
              </div>

              <div className={`flex justify-center gap-4 mb-5 ${shake ? 'animate-bounce' : ''}`}>
                {[0, 1, 2, 3].map(i => (
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

              <div className="grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
                  <button key={`pinkey-${k}`} onClick={() => handleKey(k)} disabled={success} className="pin-key rounded-xl h-12 text-lg font-semibold disabled:opacity-40">{k}</button>
                ))}
                <button onClick={() => { setPin(''); setError(''); }} disabled={success} className="pin-key rounded-xl h-12 text-xs text-muted-foreground">CLR</button>
                <button onClick={() => handleKey('0')} disabled={success} className="pin-key rounded-xl h-12 text-lg font-semibold">0</button>
                <button onClick={() => setPin(p => p.slice(0, -1))} disabled={success} className="pin-key rounded-xl h-12 flex items-center justify-center"><Delete size={16} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
