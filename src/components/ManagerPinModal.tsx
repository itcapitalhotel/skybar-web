'use client';

import React, { useState } from 'react';
import { ShieldCheck, Delete, X } from 'lucide-react';
import { authApi } from '@/lib/api/client';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  actionLabel: string;
  action?: string;
}

export default function ManagerPinModal({
  isOpen,
  onClose,
  onApprove,
  actionLabel,
  action = 'PRIVILEGED_ACTION',
}: ManagerPinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);

  React.useEffect(() => {
    if (!isOpen) { setPin(''); setError(''); }
  }, [isOpen]);

  const handleKey = (key: string) => {
    if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        setTimeout(async () => {
          setVerifying(true);
          try {
            const result = await authApi.verifyManagerPin({ pin: newPin, action });
            if (result.approved) {
              onApprove();
              setPin('');
            } else {
              setError('Incorrect manager PIN.');
              setShake(true);
              setTimeout(() => { setShake(false); setPin(''); }, 600);
            }
          } catch {
            setError('Incorrect manager PIN.');
            setShake(true);
            setTimeout(() => { setShake(false); setPin(''); }, 600);
          } finally {
            setVerifying(false);
          }
        }, 100);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-sm slide-up">
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Manager Approval</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{actionLabel}</p>

          <div className={`flex justify-center gap-3 mb-4 ${shake ? 'animate-bounce' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={`mgr-pin-${i}`}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  i < pin.length ? 'bg-amber-400 border-amber-400' : 'border-border bg-transparent'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-center text-xs text-rose-400 mb-3">{error}</p>}
          {verifying && <p className="text-center text-xs text-muted-foreground mb-3">Verifying...</p>}

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
              <button
                key={`mgr-key-${k}`}
                onClick={() => handleKey(k)}
                disabled={verifying}
                className="pin-key rounded-xl h-11 text-base font-semibold text-foreground disabled:opacity-40"
              >
                {k}
              </button>
            ))}
            <button onClick={() => { setPin(''); setError(''); }} className="pin-key rounded-xl h-11 text-xs text-muted-foreground">CLR</button>
            <button onClick={() => handleKey('0')} disabled={verifying} className="pin-key rounded-xl h-11 text-base font-semibold">0</button>
            <button onClick={() => setPin(p => p.slice(0, -1))} className="pin-key rounded-xl h-11 flex items-center justify-center">
              <Delete size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
