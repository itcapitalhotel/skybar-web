'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Delete, X } from 'lucide-react';
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

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  const handleKey = (key: string) => {
    if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        setTimeout(async () => {
          const userId = staffId ?? getAuthUser()?.id;
          if (!userId) {
            setError('No staff session. Please log in again.');
            setShake(true);
            setTimeout(() => { setShake(false); setPin(''); }, 600);
            return;
          }
          setVerifying(true);
          try {
            const result = await staffApi.verifyPin(userId, { pin: newPin });
            if (result.success) {
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
          }
        }, 100);
      }
    }
  };

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1));
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-sm slide-up">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Terminal Locked</h3>
            </div>
            <button onClick={onClose ?? onUnlock} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
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

          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
              <button
                key={`lock-key-${k}`}
                onClick={() => handleKey(k)}
                disabled={verifying}
                className="pin-key rounded-xl h-12 text-lg font-semibold text-foreground disabled:opacity-40"
              >
                {k}
              </button>
            ))}
            <button onClick={() => { setPin(''); setError(''); }} className="pin-key rounded-xl h-12 text-xs text-muted-foreground">CLR</button>
            <button onClick={() => handleKey('0')} disabled={verifying} className="pin-key rounded-xl h-12 text-lg font-semibold">0</button>
            <button onClick={handleBackspace} className="pin-key rounded-xl h-12 flex items-center justify-center">
              <Delete size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
