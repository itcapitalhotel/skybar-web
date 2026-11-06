'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import PinPad from '@/components/PinPad';
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
      setVerifying(true);
      try {
        const result = await authApi.verifyManagerPin({ pin, action });
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
        submittingRef.current = false;
      }
    }, 100);

    return () => window.clearTimeout(t);
  }, [pin, isOpen, verifying, action, onApprove]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-sm slide-up my-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground">Manager Approval</h3>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground touch-manipulation">
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

          <PinPad
            value={pin}
            disabled={verifying}
            keyClassName="h-11 text-base"
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
