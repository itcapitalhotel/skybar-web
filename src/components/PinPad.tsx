'use client';

import React from 'react';
import VirtualKeyboard from '@/components/VirtualKeyboard';

interface PinPadProps {
  value: string;
  maxLength?: number;
  disabled?: boolean;
  onChange: (next: string) => void;
  className?: string;
  /** kept for API compatibility — PIN pad always uses large keys */
  keyClassName?: string;
  autoFocus?: boolean;
}

/** Built-in PIN number keyboard for iPad / touch (no system keyboard required). */
export default function PinPad({
  value,
  maxLength = 4,
  disabled = false,
  onChange,
  className = '',
}: PinPadProps) {
  return (
    <VirtualKeyboard
      mode="pin"
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      onChange={onChange}
      size="lg"
      className={className}
      title="Built-in PIN keyboard"
    />
  );
}
