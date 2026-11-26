'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeftRight, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { TableData } from '@/app/components/floorData';
import { tablesApi, zonesApi } from '@/lib/api/client';
import type { ZoneData } from '@/lib/api/types';
import { findZone } from '@/lib/zoneResolve';
import { getAuthUser } from '@/lib/api/config';
import { visibleTableLabel } from '@/lib/tableName';

interface TransferTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: TableData;
  tables: TableData[];
  zones?: ZoneData[];
  onTransferred?: (targetTableId: string) => void;
}

export default function TransferTableModal({
  isOpen,
  onClose,
  sourceTable,
  tables,
  zones: zonesProp,
  onTransferred,
}: TransferTableModalProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState<ZoneData[]>(zonesProp ?? []);

  useEffect(() => {
    if (zonesProp && zonesProp.length > 0) {
      setZones(zonesProp);
      return;
    }
    if (!isOpen) return;
    let cancelled = false;
    zonesApi.list()
      .then((list) => {
        if (!cancelled) setZones(list);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      });
    return () => { cancelled = true; };
  }, [zonesProp, isOpen]);

  const zoneLabel = (zoneKey: string) => findZone(zones, zoneKey)?.label || 'Zone';

  const tableName = (table: TableData) => visibleTableLabel(table.label) || 'Table';

  const destinations = useMemo(
    () =>
      tables.filter(
        t =>
          t.id !== sourceTable.id
          && (t.status === 'available' || t.status === 'reserved'),
      ),
    [tables, sourceTable.id],
  );

  const zoneGroups = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; color?: string; tables: TableData[] }>();
    for (const table of destinations) {
      const match = findZone(zones, table.zone);
      const id = match?.id ?? (table.zone || 'other');
      const bucket = byId.get(id) ?? {
        id,
        label: match?.label || zoneLabel(table.zone),
        color: match?.color,
        tables: [],
      };
      bucket.tables.push(table);
      byId.set(id, bucket);
    }
    const order = zones.map((zone) => zone.id);
    return [...byId.values()]
      .map((group) => ({
        ...group,
        tables: [...group.tables].sort((a, b) =>
          tableName(a).localeCompare(tableName(b), undefined, { numeric: true, sensitivity: 'base' }),
        ),
      }))
      .sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  }, [destinations, zones]);

  const sourceZoneId = findZone(zones, sourceTable.zone)?.id ?? sourceTable.zone;

  useEffect(() => {
    if (!isOpen) {
      setTargetId(null);
      setZoneId(null);
      return;
    }
    setZoneId((current) => {
      if (current && zoneGroups.some((group) => group.id === current)) return current;
      const preferred = zoneGroups.find((group) => group.id === sourceZoneId) ?? zoneGroups[0];
      return preferred?.id ?? null;
    });
  }, [isOpen, sourceZoneId, zoneGroups]);

  const activeZone = zoneGroups.find((group) => group.id === zoneId) ?? zoneGroups[0];
  const zoneTables = activeZone?.tables ?? [];
  const targetTable = zoneTables.find((table) => table.id === targetId);

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
      toast.success(`Check moved to ${targetTable ? tableName(targetTable) : 'the new table'}`);
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
      <div className="glass-card-elevated rounded-2xl border border-border w-full max-w-lg slide-up max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <ArrowLeftRight size={16} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Change table</h3>
              <p className="text-xs text-muted-foreground">
                From <span className="text-foreground font-medium">{tableName(sourceTable)}</span>
                <span> · {zoneLabel(sourceTable.zone)}</span>
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
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Zone</p>
            {zoneGroups.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>No empty tables. Free a table first, or merge into a table that already has a check.</span>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                {zoneGroups.map((group) => {
                  const on = activeZone?.id === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setZoneId(group.id);
                        setTargetId(null);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                        on
                          ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                      {group.color ? (
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full"
                          style={{ background: group.color }}
                        />
                      ) : null}
                      {group.label}
                      <span className={`ml-1.5 tabular-nums ${on ? 'text-primary' : 'text-muted-foreground'}`}>
                        {group.tables.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {activeZone && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Tables in {activeZone.label}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {zoneTables.map((table) => {
                  const on = targetId === table.id;
                  const reserved = table.status === 'reserved';
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setTargetId(table.id)}
                      className={`relative rounded-xl border px-2 py-3 text-center transition-all ${
                        on
                          ? 'bg-primary/15 border-primary/50 text-primary'
                          : 'border-border text-foreground hover:bg-muted/30'
                      }`}
                    >
                      <p className="text-sm font-bold leading-none">{tableName(table)}</p>
                      <p className={`mt-1.5 text-[10px] font-medium uppercase tracking-wide ${
                        reserved ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                      >
                        {reserved ? 'Reserved' : 'Free'}
                      </p>
                      {on && (
                        <Check size={12} className="absolute top-1.5 right-1.5 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
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
            {submitting ? 'Moving…' : targetTable ? `Move to ${tableName(targetTable)}` : 'Move check'}
          </button>
        </div>
      </div>
    </div>
  );
}
