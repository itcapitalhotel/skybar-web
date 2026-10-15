'use client';

import { PRINTER_PING_COUNT, type PingSlot } from '@/lib/printerTcpTest';

export function PrinterPingIndicators({ slots }: { slots: PingSlot[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Printer ping results">
      {slots.map((slot, i) => (
        <span
          key={`ping-${i}`}
          title={
            slot === 'ok'
              ? `Ping ${i + 1}: OK`
              : slot === 'fail'
                ? `Ping ${i + 1}: failed`
                : slot === 'pending'
                  ? `Ping ${i + 1}: checking…`
                  : `Ping ${i + 1}`
          }
          className={[
            'h-2.5 w-2.5 rounded-full border transition-colors duration-200',
            slot === 'ok' && 'bg-sky-400 border-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.55)]',
            slot === 'fail' && 'bg-rose-500 border-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.45)]',
            slot === 'pending' && 'bg-muted-foreground/30 border-border animate-pulse',
            slot === 'idle' && 'bg-muted/40 border-border/80',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  );
}

export { PRINTER_PING_COUNT };
