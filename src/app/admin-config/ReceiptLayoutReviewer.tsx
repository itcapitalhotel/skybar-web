'use client';

import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import ReceiptPreview from '@/components/ReceiptPreview';
import { paymentsApi } from '@/lib/api/client';
import {
  mapReceiptApiToPreview,
  SAMPLE_RECEIPT_PREVIEW,
  type ReceiptPaperWidth,
  type ReceiptPreviewData,
} from '@/lib/receiptPreview';

interface ReceiptLayoutReviewerProps {
  receiptHeader: string;
  receiptFooter: string;
  currencySymbol: string;
}

export function ReceiptLayoutReviewer({
  receiptHeader,
  receiptFooter,
  currencySymbol,
}: ReceiptLayoutReviewerProps) {
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>('58mm');
  const [paymentIdInput, setPaymentIdInput] = useState('');
  const [previewData, setPreviewData] = useState<ReceiptPreviewData>(SAMPLE_RECEIPT_PREVIEW);
  const [source, setSource] = useState<'sample' | 'api'>('sample');
  const [loading, setLoading] = useState(false);

  const loadPaymentReceipt = async () => {
    const id = paymentIdInput.trim();
    if (!id) {
      toast.error('Enter a payment ID from a completed order');
      return;
    }
    setLoading(true);
    try {
      const receipt = await paymentsApi.getReceipt(id);
      setPreviewData(mapReceiptApiToPreview(receipt as unknown as Record<string, unknown>));
      setSource('api');
      toast.success('Receipt loaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load receipt');
    } finally {
      setLoading(false);
    }
  };

  const useSample = () => {
    setPreviewData(SAMPLE_RECEIPT_PREVIEW);
    setSource('sample');
    setPaymentIdInput('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground font-medium">Preview</strong> shows how the receipt will look on screen.
          Guest checks still print automatically to the receipt printer when a payment is completed.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[10px] uppercase text-muted-foreground mb-1">Load real payment</label>
            <input
              value={paymentIdInput}
              onChange={(e) => setPaymentIdInput(e.target.value)}
              placeholder="pay-001"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadPaymentReceipt()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Load receipt
          </button>
          <button
            type="button"
            onClick={useSample}
            className="px-3 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground"
          >
            Sample data
          </button>
          <div>
            <label className="block text-[10px] uppercase text-muted-foreground mb-1">Paper</label>
            <select
              value={paperWidth}
              onChange={(e) => setPaperWidth(e.target.value as ReceiptPaperWidth)}
              className="bg-background border border-border rounded-lg px-2 py-2 text-xs"
            >
              <option value="58mm">58mm (~302px)</option>
              <option value="80mm">80mm (~576px)</option>
            </select>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Showing: {source === 'sample' ? 'sample ticket' : `payment ${previewData.paymentId ?? '—'}`}
          {previewData.items.length === 0 && source === 'api' ? ' — API returned no items[]' : null}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-white/5 border border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Receipt preview</p>
        <ReceiptPreview
          header={receiptHeader}
          footer={receiptFooter}
          currencySymbol={currencySymbol || '$'}
          data={previewData}
          paperWidth={paperWidth}
        />
      </div>
    </div>
  );
}
