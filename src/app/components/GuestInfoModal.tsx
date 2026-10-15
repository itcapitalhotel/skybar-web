'use client';

import React, { useState } from 'react';
import { X, Users, Minus, Plus, FileText, ArrowRight } from 'lucide-react';
import { TableData } from './floorData';

interface GuestInfoModalProps {
  table: TableData;
  onClose: () => void;
  onConfirm: (guestCount: number, tableNote: string) => void;
}

export default function GuestInfoModal({ table, onClose, onConfirm }: GuestInfoModalProps) {
  const [guestCount, setGuestCount] = useState<number>(2);
  const [tableNote, setTableNote] = useState<string>('');

  const decrement = () => setGuestCount(prev => Math.max(1, prev - 1));
  const increment = () => setGuestCount(prev => prev + 1);

  const handleConfirm = () => {
    onConfirm(guestCount, tableNote.trim());
  };

  const zoneLabel =
    table.zone === 'vip' ? 'VIP Edge Skyline'
    : table.zone === 'bar' ? 'Main Bar'
    : table.zone === 'terrace' ? 'Outdoor Terrace'
    : 'Cabana Deck';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-card-elevated rounded-2xl border border-border flex flex-col overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Table {table.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{zoneLabel}{table.minSpend ? ` · $${table.minSpend} min spend` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Guest Count */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Users size={14} className="text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Number of Guests</span>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={decrement}
                disabled={guestCount <= 1}
                className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Minus size={16} />
              </button>
              <div className="w-20 h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary text-tabular">{guestCount}</span>
              </div>
              <button
                onClick={increment}
                className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Plus size={16} />
              </button>
            </div>
            {/* Quick select buttons */}
            <div className="flex items-center gap-2 mt-3 justify-center flex-wrap">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setGuestCount(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all border ${
                    guestCount === n
                      ? 'bg-primary/20 border-primary/50 text-primary' :'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Table Note */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <FileText size={14} className="text-amber-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">Table Note</span>
              <span className="text-xs text-muted-foreground ml-auto">Optional</span>
            </div>
            <textarea
              value={tableNote}
              onChange={e => setTableNote(e.target.value)}
              placeholder="e.g. Birthday celebration, allergy: nuts, VIP guest..."
              rows={3}
              className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-foreground text-xs focus:outline-none focus:border-primary transition-colors resize-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn-ghost rounded-xl py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            Open Menu
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
