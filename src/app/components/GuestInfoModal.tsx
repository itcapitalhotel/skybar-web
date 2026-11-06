'use client';

import React, { useEffect, useState } from 'react';
import { X, Users, Minus, Plus, FileText, ArrowRight } from 'lucide-react';
import { TableData } from './floorData';
import { zonesApi } from '@/lib/api/client';
import type { ZoneData } from '@/lib/api/types';
import { findZone } from '@/lib/zoneResolve';

interface GuestInfoModalProps {
  table: TableData;
  onClose: () => void;
  onConfirm: (guestCount: number, tableNote: string) => void;
  /** Optional preloaded zones from the floor map (avoids an extra fetch). */
  zones?: ZoneData[];
}

export default function GuestInfoModal({ table, onClose, onConfirm, zones: zonesProp }: GuestInfoModalProps) {
  const [guestCount, setGuestCount] = useState<number>(2);
  const [tableNote, setTableNote] = useState<string>('');
  const [zones, setZones] = useState<ZoneData[]>(zonesProp ?? []);

  useEffect(() => {
    if (zonesProp && zonesProp.length > 0) {
      setZones(zonesProp);
      return;
    }
    let cancelled = false;
    zonesApi.list()
      .then((list) => {
        if (!cancelled) setZones(list);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      });
    return () => { cancelled = true; };
  }, [zonesProp, table.id]);

  const decrement = () => setGuestCount(prev => Math.max(1, prev - 1));
  const increment = () => setGuestCount(prev => prev + 1);

  const handleConfirm = () => {
    onConfirm(guestCount, tableNote.trim());
  };

  const matched = findZone(zones, table.zone);
  const zoneLabel = matched?.label || table.zone || 'Zone';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-overlay absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-card-elevated rounded-2xl border border-border flex flex-col overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Table {table.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {zoneLabel}
              {table.minSpend ? ` · $${table.minSpend} min spend` : ''}
            </p>
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
            <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users size={12} />
              Number of Guests
            </label>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={decrement}
                className="w-11 h-11 rounded-xl border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center transition-all"
              >
                <Minus size={16} />
              </button>
              <div className="flex-1 h-11 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                <span className="text-xl font-bold text-foreground tabular-nums">{guestCount}</span>
              </div>
              <button
                type="button"
                onClick={increment}
                className="w-11 h-11 rounded-xl border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center transition-all"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Table Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText size={12} />
              Table Note <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              value={tableNote}
              onChange={(e) => setTableNote(e.target.value)}
              placeholder="Allergy, celebration, seating preference…"
              rows={3}
              className="mt-2 w-full rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full btn-primary rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2"
          >
            Continue to Menu
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
