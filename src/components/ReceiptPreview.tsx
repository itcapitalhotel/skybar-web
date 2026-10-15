'use client';

import React from 'react';
import type { ReceiptPaperWidth, ReceiptPreviewData } from '@/lib/receiptPreview';
import { RECEIPT_PAPER_WIDTH_PX } from '@/lib/receiptPreview';
import { formatMoney, lineTotal } from '@/lib/receiptMoney';
import type { PaymentMethod } from '@/lib/api/types';

export interface ReceiptPreviewProps {
  header: string;
  footer: string;
  currencySymbol: string;
  data: ReceiptPreviewData;
  paperWidth?: ReceiptPaperWidth;
  className?: string;
}

function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Card';
    case 'qr':
      return 'QR';
    case 'room':
      return 'Room charge';
    default:
      return String(method).toUpperCase();
  }
}

function formatWhen(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ReceiptPreview({
  header,
  footer,
  currencySymbol,
  data,
  paperWidth = '58mm',
  className = '',
}: ReceiptPreviewProps) {
  const widthPx = RECEIPT_PAPER_WIDTH_PX[paperWidth];
  const headerLines = header.split('\n').filter((l) => l.length > 0);
  const footerLines = footer.split('\n').filter((l) => l.length > 0);
  const closed = formatWhen(data.closedAt) ?? formatWhen(data.openedAt);
  const change = data.change ?? 0;
  const discount = data.discount ?? 0;

  return (
    <div className={`flex justify-center ${className}`}>
      <article
        className="bg-white text-black shadow-lg rounded-sm font-mono text-[11px] leading-snug select-text"
        style={{ width: widthPx, maxWidth: '100%' }}
        aria-label="Receipt preview"
      >
        <div className="px-3 py-4 space-y-3">
          <header className="text-center border-b border-dashed border-gray-400 pb-3">
            {headerLines.map((line, i) => (
              <p key={`h-${i}`} className={i === 0 ? 'font-bold text-[13px] tracking-tight' : 'text-gray-600 text-[10px]'}>
                {line}
              </p>
            ))}
          </header>

          {(data.tableLabel || data.zoneLabel || data.paymentId || closed) && (
            <div className="text-[10px] text-gray-600 space-y-0.5 border-b border-dashed border-gray-300 pb-2">
              {data.tableLabel ? (
                <p className="text-gray-800">
                  Table: {data.tableLabel}
                  {data.zoneLabel ? ` · ${data.zoneLabel}` : ''}
                </p>
              ) : null}
              {data.paymentId && data.paymentId !== 'preview-sample' ? (
                <p className="truncate">Ref: {data.paymentId}</p>
              ) : null}
              {closed ? <p>{closed}</p> : null}
              {data.staffName ? <p>Server: {data.staffName}</p> : null}
            </div>
          )}

          <section className="space-y-3">
            {data.items.length === 0 ? (
              <p className="text-gray-500 text-center py-2">No line items</p>
            ) : (
              data.items.map((item, idx) => {
                const total = lineTotal(item.qty, item.unitPrice);
                const subParts = [`${item.qty} × ${item.unitPrice.toFixed(2)}`];
                if (item.size) subParts.push(item.size);
                return (
                  <div key={`line-${idx}`} className="space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-900 font-medium break-words min-w-0 flex-1">{item.name}</span>
                      <span className="tabular-nums text-gray-900 shrink-0">{formatMoney(total, currencySymbol)}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 pl-0.5">
                      {subParts.join(' · ')}
                      {item.notes ? ` · ${item.notes}` : null}
                    </p>
                  </div>
                );
              })
            )}
          </section>

          <section className="border-t border-dashed border-gray-400 pt-2 space-y-1 text-gray-800">
            <div className="flex justify-between gap-2">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(data.subtotal, currencySymbol)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Service</span>
              <span className="tabular-nums">{formatMoney(data.serviceCharge, currencySymbol)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>VAT</span>
              <span className="tabular-nums">{formatMoney(data.vat, currencySymbol)}</span>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between gap-2 text-emerald-700">
                <span>Discount</span>
                <span className="tabular-nums">−{formatMoney(discount, currencySymbol)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2 font-bold text-[12px] border-t border-dashed border-gray-400 pt-2 mt-1">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatMoney(data.total, currencySymbol)}</span>
            </div>
          </section>

          <section className="border-t border-dashed border-gray-400 pt-2 space-y-1 text-[10px] text-gray-700">
            <div className="flex justify-between gap-2">
              <span>Payment</span>
              <span className="uppercase tabular-nums">{methodLabel(data.method)}</span>
            </div>
            {data.method === 'cash' && data.cashTendered != null ? (
              <>
                <div className="flex justify-between gap-2">
                  <span>Tendered</span>
                  <span className="tabular-nums">{formatMoney(data.cashTendered, currencySymbol)}</span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>Change</span>
                  <span className="tabular-nums">{formatMoney(change, currencySymbol)}</span>
                </div>
              </>
            ) : null}
            {data.method === 'room' && data.roomNumber ? (
              <div className="flex justify-between gap-2">
                <span>Room</span>
                <span>{data.roomNumber}</span>
              </div>
            ) : null}
          </section>

          <footer className="text-center border-t border-dashed border-gray-400 pt-3 text-gray-600 text-[10px]">
            {footerLines.map((line, i) => (
              <p key={`f-${i}`}>{line}</p>
            ))}
          </footer>
        </div>
      </article>
    </div>
  );
}
