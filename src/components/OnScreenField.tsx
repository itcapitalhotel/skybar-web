'use client';

import React, { useState } from 'react';
import VirtualKeyboard, { type VirtualKeyboardMode } from '@/components/VirtualKeyboard';

interface OnScreenFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  mode?: VirtualKeyboardMode;
  required?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * Text field that uses the app's built-in keyboard on tap (iPad-friendly).
 * Sets inputMode=none + readOnly so the iOS system keyboard stays closed.
 */
export default function OnScreenField({
  label,
  value,
  onChange,
  placeholder,
  mode = 'text',
  required,
  className = '',
  inputClassName = '',
}: OnScreenFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}{required ? ' *' : ''}
      </label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full text-left px-3 py-3 rounded-xl text-base bg-muted/20 border transition-all touch-manipulation ${
          open ? 'border-cyan-500/50 ring-1 ring-cyan-500/30' : 'border-border'
        } ${inputClassName}`}
        style={{ fontSize: 16, minHeight: 48 }}
      >
        {value ? (
          <span className="text-foreground break-all">{value}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? 'Tap to type'}</span>
        )}
      </button>

      {open ? (
        <div className="mt-2">
          <VirtualKeyboard
            mode={mode}
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
            size="md"
            title="Built-in keyboard"
          />
        </div>
      ) : null}
    </div>
  );
}
