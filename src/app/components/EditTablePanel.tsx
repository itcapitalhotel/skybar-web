'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, Save, AlertCircle } from 'lucide-react';
import type { TableData, TableShape } from './floorData';
import TableShapePicker from './TableShapePicker';

interface EditTablePanelProps {
  table: TableData | null;
  saving: boolean;
  onRename: (tableId: string, label: string) => Promise<void>;
  onDelete: (tableId: string) => Promise<void>;
  onChangeShape: (tableId: string, shape: TableShape) => Promise<void>;
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  bill: 'Bill ready',
};

export default function EditTablePanel({
  table,
  saving,
  onRename,
  onDelete,
  onChangeShape,
}: EditTablePanelProps) {
  const [label, setLabel] = useState('');
  const [shape, setShape] = useState<TableShape>('rect');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    setLabel(table?.label ?? '');
    setShape(table?.shape ?? 'rect');
    setDeleteConfirm(false);
  }, [table?.id, table?.label, table?.shape]);

  if (!table) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <p className="text-sm font-medium text-foreground/80">No table selected</p>
        <p className="text-xs mt-2 max-w-[220px]">
          Tap a table on the floor plan to change its name or remove it. Drag tables to reposition.
        </p>
      </div>
    );
  }

  const canDelete = table.status === 'available';
  const labelChanged = label.trim() !== table.label && label.trim().length > 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Table</p>
        <p className="text-lg font-bold text-foreground">{table.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {STATUS_LABELS[table.status] ?? table.status}
          {' · '}
          {table.zone.toUpperCase()}
          {' · '}
          cap {table.capacity}
        </p>
      </div>

      <div>
        <label htmlFor="edit-table-label" className="text-xs font-medium text-muted-foreground block mb-1.5">
          Display name
        </label>
        <input
          id="edit-table-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. V3"
          className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <button
        type="button"
        disabled={!labelChanged || saving}
        onClick={() => void onRename(table.id, label.trim())}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Save size={14} />
        Save name
      </button>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Table shape</label>
        <p className="text-[10px] text-muted-foreground mb-2">Updates the floor plan icon immediately.</p>
        <TableShapePicker
          value={shape}
          disabled={saving}
          onChange={(next) => {
            if (!table || next === shape) return;
            setShape(next);
            void onChangeShape(table.id, next);
          }}
        />
      </div>

      <div className="pt-2 border-t border-border">
        {!canDelete && (
          <p className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex gap-2 mb-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>Only empty (available) tables can be deleted. Clear or pay the check first.</span>
          </p>
        )}

        {!deleteConfirm ? (
          <button
            type="button"
            disabled={!canDelete || saving}
            onClick={() => setDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-semibold hover:bg-rose-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
            Delete table
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Remove <strong className="text-foreground">{table.label}</strong> permanently?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:bg-muted/40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDelete(table.id)}
                className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground font-mono break-all">ID: {table.id}</p>
    </div>
  );
}
