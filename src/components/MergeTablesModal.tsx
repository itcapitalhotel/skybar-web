'use client';

import React, { useState } from 'react';
import { X, Merge, Check, ChevronRight, Users, DollarSign, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { TableData, OrderItem } from '@/app/components/floorData';
import { tablesApi } from '@/lib/api/client';

interface MergeTablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: TableData[];
  tableOrders: Record<string, OrderItem[]>;
  onMerged?: () => void;
}

export default function MergeTablesModal({ isOpen, onClose, tables, tableOrders, onMerged }: MergeTablesModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [merging, setMerging] = useState(false);

  const toggleTable = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id);
        if (primaryId === id) setPrimaryId(next[0] ?? null);
        return next;
      }
      const next = [...prev, id];
      if (!primaryId) setPrimaryId(id);
      return next;
    });
  };

  const selectedTables = tables.filter(t => selectedIds.includes(t.id));
  const primaryTable = tables.find(t => t.id === primaryId);

  const allMergedItems: (OrderItem & { sourceLabel: string })[] = selectedIds.flatMap(tid => {
    const tbl = tables.find(t => t.id === tid);
    return (tableOrders[tid] || [])
      .filter(i => i.status !== 'Voided')
      .map(i => ({ ...i, sourceLabel: tbl?.label ?? tid }));
  });

  const mergedTotal = allMergedItems.reduce((a, i) => a + i.unitPrice * i.qty, 0) * 1.21;
  const totalGuests = selectedTables.reduce((a, t) => a + t.guests, 0);

  const handleConfirm = async () => {
    if (selectedIds.length < 2) {
      toast.error('Select at least 2 tables to merge');
      return;
    }
    if (!primaryId) return;
    setMerging(true);
    try {
      const others = selectedIds.filter(id => id !== primaryId);
      for (const sourceId of others) {
        await tablesApi.merge({ sourceTableId: sourceId, targetTableId: primaryId });
      }
      toast.success(`Tables ${selectedTables.map(t => t.label).join(', ')} merged into Table ${primaryTable?.label}`);
      setSelectedIds([]);
      setPrimaryId(null);
      setStep('select');
      onMerged?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge tables');
    } finally {
      setMerging(false);
    }
  };

  const handleNext = () => {
    if (selectedIds.length < 2) {
      toast.error('Select at least 2 tables to merge');
      return;
    }
    setStep('review');
  };

  const handleBack = () => setStep('select');

  const handleClose = () => {
    setSelectedIds([]);
    setPrimaryId(null);
    setStep('select');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4">
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-lg slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Merge size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Merge Tables</h3>
              <p className="text-xs text-muted-foreground">
                {step === 'select'
                  ? 'Select tables to combine — API merges one secondary into primary at a time'
                  : `Merging ${selectedTables.length} tables · ${allMergedItems.length} items`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 pt-4">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-all ${step === 'select' ? 'bg-violet-500/15 border-violet-500/30 text-violet-400' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'}`}>
            {step !== 'select' ? <Check size={11} /> : <span className="w-3 h-3 rounded-full bg-violet-400 inline-block" />}
            1. Select Tables
          </div>
          <ChevronRight size={12} className="text-muted-foreground" />
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-all ${step === 'review' ? 'bg-violet-500/15 border-violet-500/30 text-violet-400' : 'border-border text-muted-foreground'}`}>
            <span className="w-3 h-3 rounded-full bg-current inline-block opacity-60" />
            2. Review & Confirm
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">

          {/* STEP 1: Select Tables */}
          {step === 'select' && (
            <div className="space-y-4 fade-in">
              {selectedIds.length >= 2 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>All orders will be combined under the <strong>primary table</strong>. Tap a selected table to set it as primary.</span>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Tables</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {tables.map(t => {
                    const items = (tableOrders[t.id] || []).filter(i => i.status !== 'Voided');
                    const total = items.reduce((a, i) => a + i.unitPrice * i.qty, 0) * 1.21;
                    const isSelected = selectedIds.includes(t.id);
                    const isPrimary = primaryId === t.id;

                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (isSelected && selectedIds.length > 1) {
                            // If already selected and more than 1 selected, set as primary
                            setPrimaryId(t.id);
                          } else {
                            toggleTable(t.id);
                          }
                        }}
                        className={`relative flex flex-col gap-1.5 p-3 rounded-xl border transition-all duration-150 text-left ${
                          isPrimary
                            ? 'bg-violet-500/20 border-violet-500/50 ring-1 ring-violet-500/30'
                            : isSelected
                            ? 'bg-violet-500/10 border-violet-500/30'
                            : 'border-border hover:bg-muted/30 hover:border-border'
                        }`}
                      >
                        {isPrimary && (
                          <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/30 text-violet-300 border border-violet-500/30">
                            PRIMARY
                          </span>
                        )}
                        {isSelected && !isPrimary && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-violet-500/30 border border-violet-500/40 flex items-center justify-center">
                            <Check size={9} className="text-violet-300" />
                          </span>
                        )}
                        <span className="text-sm font-bold text-foreground pr-6">{t.label}</span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={10} />
                          {t.guests} guests
                        </div>
                        {total > 0 && (
                          <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                            <DollarSign size={10} className="text-emerald-400" />
                            {total.toFixed(2)}
                          </div>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold w-fit ${
                          t.status === 'bill' ?'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25' :'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                        }`}>
                          {t.status === 'bill' ? 'Bill' : 'Open'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedIds.length >= 2 && (
                <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs space-y-1">
                  <p className="font-semibold text-foreground mb-2">Merge Summary</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tables selected</span>
                    <span className="text-foreground font-medium">{selectedTables.map(t => t.label).join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Combined guests</span>
                    <span className="text-foreground font-medium">{totalGuests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total items</span>
                    <span className="text-foreground font-medium">{allMergedItems.length}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1">
                    <span className="text-muted-foreground">Combined total</span>
                    <span className="text-foreground font-bold text-tabular">${mergedTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Review */}
          {step === 'review' && (
            <div className="space-y-4 fade-in">
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs space-y-1.5">
                <p className="font-semibold text-violet-300 mb-2">Merge Details</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Primary table</span>
                  <span className="text-foreground font-bold">Table {primaryTable?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Merging from</span>
                  <span className="text-foreground font-medium">
                    {selectedTables.filter(t => t.id !== primaryId).map(t => t.label).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Combined guests</span>
                  <span className="text-foreground font-medium">{totalGuests}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">Combined total (incl. tax)</span>
                  <span className="text-foreground font-bold text-tabular">${mergedTotal.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Combined Order Items</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                  {allMergedItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No active items across selected tables</p>
                  ) : (
                    allMergedItems.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/20 border border-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold shrink-0">
                            {item.sourceLabel}
                          </span>
                          <span className="text-foreground truncate">{item.qty}× {item.name}</span>
                        </div>
                        <span className="text-muted-foreground text-tabular shrink-0 ml-2">${(item.unitPrice * item.qty).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex gap-3">
          {step === 'select' ? (
            <>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={selectedIds.length < 2}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Review Merge
                <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleBack}
                className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 text-sm font-medium transition-all"
              >
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 transition-all"
              >
                <Merge size={15} />
                Confirm Merge
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
