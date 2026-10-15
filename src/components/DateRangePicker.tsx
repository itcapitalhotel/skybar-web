'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { localDateString } from '@/lib/bookingTableStatus';
import 'react-day-picker/style.css';

export interface DateRangeValue {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
}

type PickerMode = 'single' | 'range';

function parseLocalYmd(ymd: string): Date | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayRange(from: string, to: string): string {
  const fmt = (ymd: string) => {
    const d = parseLocalYmd(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

const PRESETS: { id: string; label: string; range: () => DateRangeValue }[] = [
  { id: 'today', label: 'Today', range: () => { const t = localDateString(); return { from: t, to: t }; } },
  {
    id: '7d',
    label: '7 days',
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { from: localDateString(start), to: localDateString(end) };
    },
  },
  {
    id: '30d',
    label: '30 days',
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return { from: localDateString(start), to: localDateString(end) };
    },
  },
];

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  try {
    input.showPicker?.();
  } catch {
    input.click();
  }
}

export default function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<PickerMode>(() => (value.from === value.to ? 'single' : 'range'));
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [singleSelected, setSingleSelected] = useState<Date | undefined>(() => parseLocalYmd(value.from));
  const [rangeSelected, setRangeSelected] = useState<DateRange | undefined>(() => {
    const from = parseLocalYmd(value.from);
    const to = parseLocalYmd(value.to);
    return from && to ? { from, to } : undefined;
  });
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setMode(value.from === value.to ? 'single' : 'range');
    setSingleSelected(parseLocalYmd(value.from));
    const from = parseLocalYmd(value.from);
    const to = parseLocalYmd(value.to);
    setRangeSelected(from && to ? { from, to } : undefined);
  }, [open, value.from, value.to]);

  const updatePanelPosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const panelW = panelRef.current?.offsetWidth ?? 300;
    const maxLeft = window.innerWidth - panelW - 8;
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    setPanelPos({ top: rect.bottom + gap, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(updatePanelPosition);
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const commit = (from: string, to: string) => {
    let f = from;
    let t = to;
    if (parseLocalYmd(f)! > parseLocalYmd(t)!) [f, t] = [t, f];
    onChange({ from: f, to: t });
    setOpen(false);
  };

  const applyPreset = (r: DateRangeValue) => {
    onChange(r);
    setOpen(false);
  };

  const syncDraftToRange = (from: string, to: string) => {
    setDraftFrom(from);
    setDraftTo(to);
    const fd = parseLocalYmd(from);
    const td = parseLocalYmd(to);
    if (fd && td) setRangeSelected({ from: fd, to: td });
  };

  const popover = open && mounted ? (
    <>
      <button
        type="button"
        aria-label="Close date picker"
        className="fixed inset-0 z-[9998] cursor-default bg-black/20 backdrop-blur-[1px]"
        onClick={() => setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Select dates"
        style={{ top: panelPos.top, left: panelPos.left }}
        className="date-range-picker-popover date-range-picker-popover--compact fixed z-[9999] rounded-xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden"
      >
        <div className="p-2 border-b border-border bg-muted/20 space-y-2">
          <div className="flex rounded-md border border-border p-0.5 bg-background/80">
            {(['single', 'range'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  if (m === 'single') {
                    const d = parseLocalYmd(draftFrom) ?? new Date();
                    const ymd = localDateString(d);
                    setDraftFrom(ymd);
                    setDraftTo(ymd);
                    setSingleSelected(d);
                  } else {
                    syncDraftToRange(draftFrom, draftTo);
                  }
                }}
                className={`flex-1 py-1 text-[11px] font-semibold rounded transition-colors ${
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'single' ? 'One day' : 'Range'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.range())}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5"
              >
                {p.label}
              </button>
            ))}
          </div>

          {mode === 'range' && (
            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="text-[9px] font-semibold uppercase text-muted-foreground">From</span>
                <div className="relative">
                  <input
                    ref={fromInputRef}
                    type="date"
                    value={draftFrom}
                    onChange={e => syncDraftToRange(e.target.value, draftTo)}
                    className="field-input pr-7 text-[11px] py-1.5 min-h-0"
                  />
                  <button
                    type="button"
                    aria-label="Pick from date"
                    onClick={() => openNativeDatePicker(fromInputRef.current)}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary"
                  >
                    <CalendarIcon size={12} />
                  </button>
                </div>
              </label>
              <label className="space-y-0.5">
                <span className="text-[9px] font-semibold uppercase text-muted-foreground">To</span>
                <div className="relative">
                  <input
                    ref={toInputRef}
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    onChange={e => syncDraftToRange(draftFrom, e.target.value)}
                    className="field-input pr-7 text-[11px] py-1.5 min-h-0"
                  />
                  <button
                    type="button"
                    aria-label="Pick to date"
                    onClick={() => openNativeDatePicker(toInputRef.current)}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary"
                  >
                    <CalendarIcon size={12} />
                  </button>
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="p-1.5 flex justify-center date-range-picker-calendar date-range-picker-calendar--compact">
          {mode === 'single' ? (
            <DayPicker
              mode="single"
              selected={singleSelected}
              onSelect={day => {
                if (!day) return;
                setSingleSelected(day);
                commit(localDateString(day), localDateString(day));
              }}
              defaultMonth={singleSelected ?? new Date()}
              showOutsideDays
            />
          ) : (
            <DayPicker
              mode="range"
              selected={rangeSelected}
              onSelect={range => {
                setRangeSelected(range);
                if (range?.from) setDraftFrom(localDateString(range.from));
                if (range?.to) {
                  setDraftTo(localDateString(range.to));
                  commit(localDateString(range.from), localDateString(range.to));
                } else if (range?.from) {
                  setDraftTo(localDateString(range.from));
                }
              }}
              defaultMonth={parseLocalYmd(draftFrom) ?? new Date()}
              numberOfMonths={1}
              showOutsideDays
            />
          )}
        </div>

        {mode === 'range' && (
          <div className="flex justify-end gap-1.5 px-2 py-1.5 border-t border-border bg-muted/10">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftFrom || !draftTo}
              onClick={() => commit(draftFrom, draftTo)}
              className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`field-input inline-flex items-center gap-2 text-left font-normal hover:border-primary/50 transition-colors py-1.5 px-2.5 min-h-9 min-w-[11rem] max-w-[14rem] ${className}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarIcon size={14} className="text-primary shrink-0" />
        <span className="truncate text-xs font-medium text-foreground">
          {formatDisplayRange(value.from, value.to)}
        </span>
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  );
}

export function todayRange(): DateRangeValue {
  const t = localDateString();
  return { from: t, to: t };
}
