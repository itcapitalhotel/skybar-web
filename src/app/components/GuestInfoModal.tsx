'use client';

import React, { useEffect, useState } from 'react';
import { X, Users, Minus, Plus, FileText, ArrowRight, ClipboardList } from 'lucide-react';
import { TableData } from './floorData';
import { orderTypesApi, zonesApi } from '@/lib/api/client';
import type { OrderType, ZoneData } from '@/lib/api/types';
import { findZone } from '@/lib/zoneResolve';

interface GuestInfoModalProps {
  table: TableData;
  onClose: () => void;
  onConfirm: (guestCount: number, tableNote: string, orderTypeId: string, orderTypeName: string) => void;
  /** Optional preloaded zones from the floor map (avoids an extra fetch). */
  zones?: ZoneData[];
  /** Party size from a booking. Falls back to the table, then 2. */
  initialGuests?: number;
  /** Booking note, shown in the same field as a walk-in table note. */
  initialNote?: string;
  /** Guest name from the booking, shown under the table label. */
  guestName?: string;
}

export default function GuestInfoModal({ table, onClose, onConfirm, zones: zonesProp, initialGuests, initialNote, guestName }: GuestInfoModalProps) {
  const startingGuests = initialGuests && initialGuests > 0
    ? initialGuests
    : table.guests > 0
      ? table.guests
      : 2;
  const [guestCount, setGuestCount] = useState<number>(startingGuests);
  const [tableNote, setTableNote] = useState<string>(initialNote ?? '');
  const [zones, setZones] = useState<ZoneData[]>(zonesProp ?? []);
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([
    { id: 'in-house', name: 'In House', sortOrder: 1, active: true },
    { id: 'walk-in', name: 'Walk In', sortOrder: 2, active: true },
  ]);
  const [orderTypeId, setOrderTypeId] = useState(table.orderTypeId || 'in-house');

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

  useEffect(() => {
    let cancelled = false;
    orderTypesApi.list()
      .then((list) => {
        if (cancelled) return;
        const active = list.filter((type) => type.active !== false && type.name?.trim());
        if (active.length === 0) return;
        setOrderTypes(active);
        setOrderTypeId((current) => (
          active.some((type) => type.id === current) ? current : active[0].id
        ));
      })
      .catch(() => { /* keep In House and Walk In */ });
    return () => { cancelled = true; };
  }, [table.id]);

  const decrement = () => setGuestCount(prev => Math.max(1, prev - 1));
  const increment = () => setGuestCount(prev => prev + 1);

  const handleConfirm = () => {
    const selected = orderTypes.find((type) => type.id === orderTypeId) ?? orderTypes[0];
    onConfirm(guestCount, tableNote.trim(), selected?.id ?? 'in-house', selected?.name ?? 'In House');
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
              {guestName ? `${guestName} · ` : ''}
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

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <ClipboardList size={12} />
              Order Type
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {orderTypes.map((type) => {
                const selected = type.id === orderTypeId;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setOrderTypeId(type.id)}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${
                      selected
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {type.name}
                  </button>
                );
              })}
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
