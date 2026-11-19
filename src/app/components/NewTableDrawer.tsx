'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { tablesApi, zonesApi } from '@/lib/api/client';
import type { TableShape } from '@/lib/api/types';
import TableShapePicker from './TableShapePicker';
import type { TableShape as FloorTableShape } from './floorData';

interface NewTableDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTableAdded?: () => void;
  /** Floor currently on screen. New tables are created here, not in the first zone. */
  defaultZoneId?: string | null;
}

interface TableFormData {
  tableNumber: string;
  capacity: number;
  zone: string;
  minSpend: string;
  shape: FloorTableShape;
}

export default function NewTableDrawer({ isOpen, onClose, onTableAdded, defaultZoneId }: NewTableDrawerProps) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TableFormData>({
    defaultValues: { zone: '', shape: 'rect', capacity: 4 },
  });
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<{ id: string; label: string }[]>([]);
  const selectedShape = watch('shape');
  const zoneId = watch('zone');
  // The native <select> jumps to the first option while the list is loading and
  // would otherwise save Lounge tables into Moon Area.
  const resolvedZoneId = zones.some((z) => z.id === zoneId)
    ? zoneId
    : (zones.find((z) => z.id === defaultZoneId)?.id ?? zones[0]?.id ?? '');

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    zonesApi.list()
      .then((list) => {
        if (cancelled) return;
        setZones(list.filter((z) => z.isActive).map((z) => ({ id: z.id, label: z.label })));
      })
      .catch(() => { if (!cancelled) setZones([]); });
    return () => { cancelled = true; };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || !resolvedZoneId || resolvedZoneId === zoneId) return;
    setValue('zone', resolvedZoneId, { shouldValidate: true });
  }, [isOpen, resolvedZoneId, zoneId, setValue]);

  const onSubmit = async (data: TableFormData) => {
    setLoading(true);
    try {
      const zone = zones.some((z) => z.id === data.zone) ? data.zone : resolvedZoneId;
      if (!zone) {
        toast.error('Choose a zone first.');
        return;
      }
      await tablesApi.create({
        label: data.tableNumber,
        zone,
        capacity: Number(data.capacity),
        shape: data.shape as TableShape,
        x: 60,
        y: 80,
        minSpend: data.minSpend ? Number(data.minSpend) : undefined,
      });
      const zoneName = zones.find((z) => z.id === zone)?.label || zone;
      toast.success(`Table ${data.tableNumber} added to ${zoneName}`);
      reset();
      onClose();
      onTableAdded?.();
    } catch (err) {
      const message = err instanceof Error && err.message
        ? err.message
        : 'Failed to add table. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="modal-overlay absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-card-elevated border-l border-border h-full overflow-y-auto scrollbar-thin slide-up">
        <div className="p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">Add New Table</h3>
              <p className="text-xs text-muted-foreground">Configure layout and zone assignment</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Table Number / ID</label>
              <input
                {...register('tableNumber', { required: 'Table number is required' })}
                placeholder="e.g. V4 or T9"
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              />
              {errors.tableNumber && <p className="text-xs text-rose-400 mt-1">{errors.tableNumber.message}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Seating Capacity</label>
              <input
                type="number"
                {...register('capacity', { required: true, min: 1, max: 20 })}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              />
              {errors.capacity && <p className="text-xs text-rose-400 mt-1">Capacity must be 1–20</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Zone</label>
              <select
                value={resolvedZoneId}
                onChange={(e) => setValue('zone', e.target.value, { shouldValidate: true })}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
              {errors.zone && <p className="text-xs text-rose-400 mt-1">{errors.zone.message}</p>}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Table shape</label>
              <TableShapePicker
                value={selectedShape}
                onChange={(shape) => setValue('shape', shape, { shouldValidate: true })}
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Minimum Spend <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <p className="text-[10px] text-muted-foreground mb-1.5">Leave blank for no minimum spend requirement</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  {...register('minSpend')}
                  placeholder="0"
                  className="w-full bg-input border border-border rounded-lg pl-7 pr-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn-ghost rounded-xl py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <><Plus size={15} /> Add Table</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}