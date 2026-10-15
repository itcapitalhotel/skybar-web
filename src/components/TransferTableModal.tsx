'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeftRight, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { TableData } from '@/app/components/floorData';
import { tablesApi } from '@/lib/api/client';
import { getAuthUser } from '@/lib/api/config';

interface TransferTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: TableData;
  tables: TableData[];
  onTransferred?: (targetTableId: string) => void;
}

export default function TransferTableModal({
  isOpen,
  onClose,
  sourceTable,
  tables,
  onTransferred,
}: TransferTableModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const destinations = useMemo(
    () =>
      tables.filter(
        t =>
          t.id !== sourceTable.id
          && (t.status === 'available' || t.status === 'reserved'),
      ),
    [tables, sourceTable.id],
  );

  useEffect(() => {
    if (!isOpen) {
      setTargetId(null);
      return;
    }
    setTargetId(destinations[0]?.id ?? null);
  }, [isOpen, destinations]);

  const targetTable = destinations.find(t => t.id === targetId);

  const handleConfirm = async () => {
    if (!targetId) {
      toast.error('Select a destination table');
      return;
    }
    const staffId = getAuthUser()?.id;
    if (!staffId) {
      toast.error('Sign in again to move this check');
      return;
    }

    setSubmitting(true);
    try {
      await tablesApi.transfer({
        sourceTableId: sourceTable.id,
        targetTableId: targetId,
        staffId,
      });
      toast.success(`Check moved to ${targetTable?.label ?? targetId}`);
      onTransferred?.(targetId);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to change table';
      toast.error(
        msg.toLowerCase().includes('active order') || msg.includes('400')
          ? 'Target table is not empty — pick an available table or use Merge tables.'
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-md slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <ArrowLeftRight size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Change table</h3>
              <p className="text-xs text-muted-foreground">
                Move open check from <span className="text-foreground font-medium">{sourceTable.label}</span>
                {sourceTable.guests > 0 && (
                  <span> · {sourceTable.guests} guest{sourceTable.guests === 1 ? '' : 's'}</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Moves the full active order to an empty table. Guests, staff, and items stay on the check.
            If the destination already has a bill, use <strong className="text-foreground font-medium">Merge tables</strong> instead.
          </p>

          {destinations.length === 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>No empty tables found. Free a table or switch to All Zones.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">New table</p>
              {destinations.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTargetId(t.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    targetId === t.id
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-foreground hover:bg-muted/30'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {t.zone} · {t.status} · seats {t.capacity}
                    </p>
                  </div>
                  {targetId === t.id && <Check size={16} className="text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || !targetId || destinations.length === 0}
            className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Moving…' : 'Move check'}
          </button>
        </div>
      </div>
    </div>
  );
}
