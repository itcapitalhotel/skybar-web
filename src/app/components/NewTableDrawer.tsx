'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { tablesApi } from '@/lib/api/client';
import type { TableShape } from '@/lib/api/types';

interface NewTableDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTableAdded?: () => void;
}

interface TableFormData {
  tableNumber: string;
  capacity: number;
  zone: string;
  minSpend: string;
  shape: 'circle' | 'rect' | 'cabana';
}

export default function NewTableDrawer({ isOpen, onClose, onTableAdded }: NewTableDrawerProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TableFormData>({
    defaultValues: { zone: 'bar', shape: 'rect', capacity: 4 }
  });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: TableFormData) => {
    setLoading(true);
    try {
      await tablesApi.create({
        label: data.tableNumber,
        zone: data.zone,
        capacity: Number(data.capacity),
        shape: data.shape as TableShape,
        x: 60,
        y: 80,
        minSpend: data.minSpend ? Number(data.minSpend) : undefined,
      });
      toast.success(`Table ${data.tableNumber} added to ${data.zone}`);
      reset();
      onClose();
      onTableAdded?.();
    } catch {
      toast.error('Failed to add table. Please try again.');
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
                {...register('zone', { required: true })}
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              >
                <option value="vip">VIP Edge Skyline</option>
                <option value="bar">Main Bar</option>
                <option value="terrace">Outdoor Terrace</option>
                <option value="cabana">Cabana Deck</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Table Shape</label>
              <div className="grid grid-cols-3 gap-2">
                {(['rect', 'circle', 'cabana'] as const).map(s => (
                  <label key={`shape-${s}`} className="cursor-pointer">
                    <input type="radio" value={s} {...register('shape')} className="sr-only" />
                    <div className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border hover:border-primary/50 transition-all text-xs text-muted-foreground">
                      <div className={`bg-muted/50 border border-border ${
                        s === 'circle' ? 'w-8 h-8 rounded-full' : s === 'cabana' ? 'w-10 h-6 rounded-xl' : 'w-10 h-6 rounded-md'
                      }`} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </div>
                  </label>
                ))}
              </div>
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