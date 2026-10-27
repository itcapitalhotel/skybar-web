'use client';

import React from 'react';
import type { TableShape } from './floorData';

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'rect', label: 'Square' },
  { value: 'circle', label: 'Circle' },
  { value: 'cabana', label: 'Cabana' },
  { value: 'stool', label: 'Stool' },
];

function ShapePreview({ shape }: { shape: TableShape }) {
  const base = 'bg-muted/60 border border-current';
  if (shape === 'circle' || shape === 'stool') {
    return <div className={`w-8 h-8 rounded-full ${base}`} />;
  }
  if (shape === 'cabana') {
    return <div className={`w-10 h-6 rounded-xl ${base}`} />;
  }
  return <div className={`w-10 h-6 rounded-md ${base}`} />;
}

interface TableShapePickerProps {
  value: TableShape;
  onChange: (shape: TableShape) => void;
  disabled?: boolean;
}

export default function TableShapePicker({ value, onChange, disabled }: TableShapePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SHAPES.map((s) => {
        const selected = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s.value)}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all disabled:opacity-50 ${
              selected
                ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary/40'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30'
            }`}
          >
            <ShapePreview shape={s.value} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
