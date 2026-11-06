'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lock, X } from 'lucide-react';
import PinPad from '@/components/PinPad';
import { staffApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';

interface LockModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onUnlock: () => void;
  staffId?: string;
}

export default function LockModal({ isOpen = true, onClose, onUnlock, staffId }: LockModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
      submittingRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || pin.length !== 4 || verifying) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    const t = window.setTimeout(async () => {
      const userId = staffId ?? getAuthUser()?.id;
      if (!userId) {
        setError('No staff session. Please log in again.');
        setShake(true);
        setTimeout(() => { setShake(false); setPin(''); submittingRef.current = false; }, 600);
        return;
      }
      setVerifying(true);
      try {
        const result = await staffApi.verifyPin(userId, { pin });
        if (result.success || result.valid) {
          onUnlock();
          setPin('');
        } else {
          setError('Incorrect PIN. Try again.');
          setShake(true);
          setTimeout(() => { setShake(false); setPin(''); }, 600);
        }
      } catch {
        setError('Incorrect PIN. Try again.');
        setShake(true);
        setTimeout(() => { setShake(false); setPin(''); }, 600);
      } finally {
        setVerifying(false);
        submittingRef.current = false;
      }
    }, 100);

    return () => window.clearTimeout(t);
  }, [pin, isOpen, verifying, staffId, onUnlock]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-sm slide-up my-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Terminal Locked</h3>
            </div>
            <button type="button" onClick={onClose ?? onUnlock} className="p-1 rounded-lg text-muted-foreground hover:text-foreground touch-manipulation">
              <X size={16} />
            </button>
          </div>

          <div className={`flex justify-center gap-4 mb-5 ${shake ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={`lock-pin-${i}`}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  i < pin.length ? 'bg-primary border-primary neon-cyan' : 'border-border bg-transparent'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-center text-xs text-rose-400 mb-3">{error}</p>}
          {verifying && <p className="text-center text-xs text-muted-foreground mb-3">Verifying...</p>}

          <PinPad
            value={pin}
            disabled={verifying}
            onChange={(next) => {
              setPin(next);
              setError('');
            }}
          />
        </div>
      </div>
    </div>
  );
}
