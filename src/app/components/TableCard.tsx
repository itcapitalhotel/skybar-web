'use client';

import React from 'react';
import { Users, Clock, DollarSign } from 'lucide-react';
import { TableData, formatTimer } from './floorData';

interface TableCardProps {
  table: TableData;
  isSelected: boolean;
  onSelect: (table: TableData) => void;
  editMode: boolean;
}

const STATUS_RING: Record<string, string> = {
  available: 'status-ring-available',
  occupied: 'status-ring-occupied',
  reserved: 'status-ring-reserved',
  bill: 'status-ring-bill',
};

const STATUS_BG: Record<string, string> = {
  available: 'bg-emerald-500/8',
  occupied: 'bg-rose-500/8',
  reserved: 'bg-amber-500/8',
  bill: 'bg-cyan-500/8',
};

const STATUS_LABEL_COLOR: Record<string, string> = {
  available: 'text-emerald-400',
  occupied: 'text-rose-400',
  reserved: 'text-amber-400',
  bill: 'text-cyan-400',
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  bill: 'Bill Ready',
};

export default function TableCard({ table, isSelected, onSelect, editMode }: TableCardProps) {
  const isCabana = table.shape === 'cabana';
  const isStool = table.shape === 'stool';

  if (isStool) {
    return (
      <button
        onClick={() => onSelect(table)}
        className={`relative flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all duration-150 table-card-hover ${
          STATUS_RING[table.status]
        } ${STATUS_BG[table.status]} ${
          isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
        } ${editMode ? 'drag-handle' : ''}`}
        title={`${table.label} — ${STATUS_LABELS[table.status]}`}
      >
        <div className="w-7 h-7 rounded-full border border-border bg-muted/50 flex items-center justify-center">
          <span className="text-[9px] font-bold text-foreground">{table.label.replace('Bar ', 'B')}</span>
        </div>
        <span className={`text-[8px] font-medium ${STATUS_LABEL_COLOR[table.status]}`}>
          {table.status === 'occupied' ? `$${table.orderTotal}` : STATUS_LABELS[table.status].slice(0, 4)}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(table)}
      className={`relative flex flex-col gap-2 p-3 transition-all duration-150 table-card-hover glass-card border ${
        STATUS_RING[table.status]
      } ${
        isCabana ? 'rounded-2xl min-w-[140px]' : table.shape === 'circle' ? 'rounded-full aspect-square w-[100px] items-center justify-center' : 'rounded-xl'
      } ${
        isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
      } ${editMode ? 'drag-handle' : ''}`}
    >
      {/* Table Label */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-bold text-foreground">{table.label}</span>
        {table.minSpend && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 whitespace-nowrap">
            ${table.minSpend} Min
          </span>
        )}
      </div>

      {/* Status */}
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${STATUS_LABEL_COLOR[table.status]}`}>
        {STATUS_LABELS[table.status]}
      </span>

      {/* Guests & Timer */}
      {table.status !== 'available' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Users size={10} />
            {table.guests}/{table.capacity}
          </span>
          {table.seatedMinutes > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock size={10} />
              {formatTimer(table.seatedMinutes)}
            </span>
          )}
        </div>
      )}

      {/* Order Total */}
      {table.orderTotal > 0 && (
        <div className="flex items-center gap-0.5 text-xs font-semibold text-foreground text-tabular">
          <DollarSign size={10} />
          {table.orderTotal.toFixed(0)}
        </div>
      )}

      {/* Min Spend Progress */}
      {table.minSpend && table.orderTotal > 0 && (
        <div className="w-full">
          <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                table.orderTotal >= table.minSpend ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, (table.orderTotal / table.minSpend) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Edit Mode Handle */}
      {editMode && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded bg-muted/60 flex items-center justify-center">
          <div className="grid grid-cols-2 gap-0.5">
            {[0,1,2,3].map(i => <div key={`drag-dot-${table.id}-${i}`} className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />)}
          </div>
        </div>
      )}
    </button>
  );
}