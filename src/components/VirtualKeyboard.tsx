'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Delete, Space, ArrowBigUp, X } from 'lucide-react';

export type VirtualKeyboardMode = 'numeric' | 'pin' | 'text' | 'email';

interface VirtualKeyboardProps {
  mode?: VirtualKeyboardMode;
  value: string;
  maxLength?: number;
  disabled?: boolean;
  /** Called with the full next string value */
  onChange: (next: string) => void;
  onClose?: () => void;
  className?: string;
  /** Larger keys for tablet / PIN entry */
  size?: 'md' | 'lg';
  title?: string;
}

const ROW1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW2 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW3 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW4 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', '@', '.', '_'];

function KeyButton({
  label,
  onPress,
  disabled,
  wide,
  danger,
  size,
  className = '',
}: {
  label: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
  danger?: boolean;
  size: 'md' | 'lg';
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      // onClick is more reliable on iPad Safari than pointerdown+preventDefault
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      className={[
        'rounded-xl font-semibold border select-none touch-manipulation',
        'disabled:opacity-40 active:scale-[0.96] transition-transform',
        size === 'lg' ? 'min-h-[56px] text-xl' : 'min-h-[44px] text-base',
        wide ? 'flex-[1.6]' : 'flex-1',
        danger
          ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          : 'bg-slate-800/90 border-slate-600/60 text-foreground',
        className,
      ].join(' ')}
    >
      {label}
    </button>
  );
}

/**
 * Built-in on-screen keyboard for iPad / touch POS — does not rely on the system keyboard.
 */
export default function VirtualKeyboard({
  mode = 'text',
  value,
  maxLength,
  disabled = false,
  onChange,
  onClose,
  className = '',
  size = 'md',
  title,
}: VirtualKeyboardProps) {
  const [shifted, setShifted] = useState(false);
  const isNumeric = mode === 'numeric' || mode === 'pin';

  const append = (ch: string) => {
    if (disabled) return;
    const next = `${value}${ch}`;
    onChange(maxLength != null ? next.slice(0, maxLength) : next);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled) return;
    onChange('');
  };

  // Hardware keyboard still works when a Bluetooth keyboard is plugged in
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.dataset.vkAllow !== '1') {
        // Don't steal typing from normal inputs that aren't using this keyboard
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === ' ') {
        if (!isNumeric) {
          e.preventDefault();
          append(' ');
        }
      } else if (e.key.length === 1) {
        if (isNumeric && !/\d/.test(e.key)) return;
        e.preventDefault();
        append(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, value, isNumeric, maxLength]);

  const letterRows = useMemo(() => {
    const map = (row: string[]) =>
      row.map((k) => {
        if (k === '@' || k === '.' || k === '_') return k;
        return shifted ? k.toUpperCase() : k;
      });
    return [map(ROW2), map(ROW3), map(ROW4)];
  }, [shifted]);

  if (isNumeric) {
    return (
      <div
        className={`rounded-2xl border border-cyan-500/25 bg-slate-950/95 p-3 shadow-2xl ${className}`}
        role="group"
        aria-label={title ?? 'Number keyboard'}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
            {title ?? (mode === 'pin' ? 'PIN keyboard' : 'Number keyboard')}
          </p>
          {onClose ? (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground touch-manipulation">
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
            <KeyButton key={k} label={k} onPress={() => append(k)} disabled={disabled} size={size === 'lg' || mode === 'pin' ? 'lg' : size} />
          ))}
          <KeyButton label="CLR" onPress={clear} disabled={disabled} size={size === 'lg' || mode === 'pin' ? 'lg' : size} danger />
          <KeyButton label="0" onPress={() => append('0')} disabled={disabled} size={size === 'lg' || mode === 'pin' ? 'lg' : size} />
          <KeyButton label={<Delete size={18} />} onPress={backspace} disabled={disabled} size={size === 'lg' || mode === 'pin' ? 'lg' : size} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-slate-600/50 bg-slate-950/95 p-2.5 shadow-2xl ${className}`}
      role="group"
      aria-label={title ?? 'On-screen keyboard'}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title ?? 'On-screen keyboard'}
        </p>
        {onClose ? (
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground touch-manipulation">
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 mb-1.5">
        {ROW1.map((k) => (
          <KeyButton key={k} label={k} onPress={() => append(k)} disabled={disabled} size={size} />
        ))}
      </div>
      {letterRows.map((row, idx) => (
        <div key={idx} className="flex gap-1 mb-1.5">
          {idx === 2 ? (
            <KeyButton
              label={<ArrowBigUp size={16} className={shifted ? 'text-cyan-400' : undefined} />}
              onPress={() => setShifted((s) => !s)}
              disabled={disabled}
              size={size}
              className={shifted ? 'border-cyan-500/50 bg-cyan-500/15' : ''}
            />
          ) : null}
          {row.map((k) => (
            <KeyButton
              key={`${idx}-${k}`}
              label={k}
              onPress={() => {
                append(k);
                if (shifted) setShifted(false);
              }}
              disabled={disabled}
              size={size}
            />
          ))}
          {idx === 2 ? (
            <KeyButton label={<Delete size={16} />} onPress={backspace} disabled={disabled} size={size} danger />
          ) : null}
        </div>
      ))}
      <div className="flex gap-1">
        <KeyButton label="CLR" onPress={clear} disabled={disabled} size={size} danger />
        <KeyButton
          label={
            <span className="inline-flex items-center gap-1.5">
              <Space size={14} /> Space
            </span>
          }
          onPress={() => append(' ')}
          disabled={disabled}
          size={size}
          wide
        />
        {mode === 'email' ? (
          <KeyButton label=".com" onPress={() => append('.com')} disabled={disabled} size={size} />
        ) : null}
        {onClose ? (
          <KeyButton label="Done" onPress={() => onClose()} disabled={disabled} size={size} className="border-cyan-500/40 text-cyan-300" />
        ) : null}
      </div>
    </div>
  );
}
