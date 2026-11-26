'use client';

import React, { useEffect, useState } from 'react';
import { Eye, Printer, RotateCcw } from 'lucide-react';
import type { AnalyticsTransactionDetail, PaymentBreakdown } from '@/lib/api/types';
import { receiptsApi } from '@/lib/api/client';
import {
  aggregateFinancials,
  aggregateSalesByCategoryType,
  buildReportGridRows,
  discountBreakdown,
  chargedTotal,
  formatReportMoney,
  gridColumnTotals,
  grossBillTotal,
  paymentMethodBreakdown,
  paymentRowsFromApi,
  uniqueChecks,
  DEFAULT_REPORT_RATES,
  type MenuCategoryLookup,
  type ReportGridRow,
  type ReportRates,
} from '@/app/reports/reportDocumentHelpers';
import { toast } from 'sonner';

const th =
  'border border-gray-300 bg-gray-50 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap print:px-1 print:py-0.5 print:tracking-normal';
const td = 'border border-gray-300 px-2 py-1.5 text-[11px] text-gray-800 align-middle print:px-1 print:py-0.5 print:text-[8px]';
/** Wide enough that a typical item name wraps once, never more than two lines. */
const itemCol = 'min-w-[14rem] w-[16rem] max-w-[16rem] print:min-w-0 print:w-auto print:max-w-[7.5rem]';
const tdNum = `${td} text-right tabular-nums whitespace-nowrap font-medium text-gray-900`;

const sectionTitle =
  'text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 border-b border-gray-300 pb-2 mb-3';

/** Business day: 5:00 AM on the first date through 5:00 AM the morning after the last date. */
function formatServicePeriod(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  end.setDate(end.getDate() + 1);
  const day = (date: Date) => date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${day(start)} 5:00 AM – ${day(end)} 5:00 AM`;
}

function SummaryMetricRow({
  label,
  value,
  emphasize,
  sublabel,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  sublabel?: string;
}) {
  return (
    <tr className={emphasize ? 'bg-gray-50' : undefined}>
      <td className={`${td} text-gray-600 ${emphasize ? 'font-semibold text-gray-800' : ''}`}>
        {label}
        {sublabel ? (
          <span className="block text-[9px] font-normal text-gray-400 mt-0.5 normal-case tracking-normal">
            {sublabel}
          </span>
        ) : null}
      </td>
      <td className={`${tdNum} ${emphasize ? 'text-sm font-bold' : ''}`}>{value}</td>
    </tr>
  );
}

interface SkyBarShopReportProps {
  dateFrom: string;
  dateTo: string;
  /** Epoch ms when the report was loaded; formatted only after mount to avoid hydration mismatch. */
  generatedAt: number | null;
  orderDetails: AnalyticsTransactionDetail[];
  paymentBreakdown?: PaymentBreakdown[];
  menuLookup?: MenuCategoryLookup;
  rates?: ReportRates;
  loading?: boolean;
  onViewOrder?: (paymentId: string) => void;
  onReopenOrder?: (row: ReportGridRow) => void;
}

export default function SkyBarShopReport({
  dateFrom,
  dateTo,
  generatedAt,
  orderDetails,
  paymentBreakdown,
  menuLookup,
  rates = DEFAULT_REPORT_RATES,
  loading,
  onViewOrder,
  onReopenOrder,
}: SkyBarShopReportProps) {
  const checks = uniqueChecks(orderDetails);
  const financial = aggregateFinancials(checks, rates);
  const categorySales = aggregateSalesByCategoryType(checks, menuLookup);
  const discountLines = discountBreakdown(checks);
  const paymentRows = paymentBreakdown?.length
    ? paymentRowsFromApi(paymentBreakdown, checks)
    : paymentMethodBreakdown(checks);
  const gridRows = buildReportGridRows(checks, rates);
  const colTotals = gridColumnTotals(gridRows);
  const totalOrders = checks.length;
  const totalGuests = checks.reduce(
    (s, d) => s + (Number(d.guestCount ?? d.covers ?? 1) || 1),
    0,
  );
  const paymentOrdersTotal = paymentRows.reduce((s, r) => s + r.orders, 0);
  const paymentAmountTotal = paymentRows.reduce((s, r) => s + r.totalAfterDiscount, 0);
  const orderTypeRows = (() => {
    const map = new Map<string, { checks: number; guests: number; total: number; totalAfterDiscount: number }>();
    for (const detail of checks) {
      const name = detail.orderTypeName?.trim() || '—';
      const row = map.get(name) ?? { checks: 0, guests: 0, total: 0, totalAfterDiscount: 0 };
      row.checks += 1;
      row.guests += Number(detail.guestCount ?? detail.covers ?? 0) || 0;
      row.total += grossBillTotal(detail, rates);
      row.totalAfterDiscount += chargedTotal(detail, rates);
      map.set(name, row);
    }
    return Array.from(map, ([name, row]) => ({ name, ...row }));
  })();

  const [generatedStamp, setGeneratedStamp] = useState('—');
  useEffect(() => {
    if (generatedAt == null) {
      setGeneratedStamp('—');
      return;
    }
    setGeneratedStamp(
      new Date(generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    );
  }, [generatedAt]);
  const rangeLabel = formatServicePeriod(dateFrom, dateTo);
  const categoryLineTotal = categorySales.food + categorySales.drink;

  return (
    <div className="skybar-shop-report bg-white text-gray-900 rounded-lg shadow-sm border border-gray-300 overflow-hidden print:overflow-visible print:shadow-none print:rounded-none print:border-0">
      <header className="px-6 py-4 border-b-2 border-gray-800 bg-white print:px-0 print:py-2">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 print:gap-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1 print:mb-0 print:tracking-normal">
              NAKNAK POS
            </p>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight print:text-base">
              Shop &amp; Revenue Report
            </h1>
            <p className="text-sm text-gray-600 mt-0.5 print:text-[10px]">Period: {rangeLabel}</p>
          </div>
          <div className="text-left sm:text-right text-[11px] text-gray-500 leading-relaxed">
            <p>
              <span className="text-gray-400 uppercase tracking-wide text-[9px]">Generated</span>
              <br />
              <span className="text-gray-800 font-medium" suppressHydrationWarning>
                {generatedStamp}
              </span>
            </p>
            <p className="mt-2 tabular-nums">
              {totalOrders} closed {totalOrders === 1 ? 'check' : 'checks'}
            </p>
          </div>
        </div>
      </header>

      <div className="px-6 py-4 space-y-5 max-h-[calc(100vh-11rem)] report-page-scroll print:max-h-none print:overflow-visible print:px-0 print:py-2 print:space-y-3">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 print:grid-cols-2 print:gap-3">
        <section>
          <h2 className={sectionTitle}>Executive summary</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:grid-cols-1 print:gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-2">
                Operations
              </p>
              <table className="w-full border-collapse">
                <tbody>
                  <SummaryMetricRow label="Total orders" value={String(totalOrders)} />
                  <SummaryMetricRow label="Total covers (guests)" value={String(totalGuests)} />
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-2">
                Sales mix (line items, excl. tax &amp; service)
              </p>
              <table className="w-full border-collapse">
                <tbody>
                  <SummaryMetricRow
                    label="Food"
                    sublabel="Kitchen categories"
                    value={formatReportMoney(categorySales.food)}
                  />
                  <SummaryMetricRow
                    label="Drink"
                    sublabel="Bar categories"
                    value={formatReportMoney(categorySales.drink)}
                  />
                  <SummaryMetricRow
                    label="Category subtotal"
                    value={formatReportMoney(categoryLineTotal)}
                    emphasize
                  />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <h2 className={sectionTitle}>Financial summary</h2>
          <table className="w-full max-w-xl border-collapse">
            <thead>
              <tr>
                <th className={th}>Description</th>
                <th className={`${th} text-right w-36`}>Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              <SummaryMetricRow label="Net Sales" value={formatReportMoney(financial.subtotal)} />
              <SummaryMetricRow label="Service Charge" value={formatReportMoney(financial.serviceCharge)} />
              <SummaryMetricRow label="Tax Collected" value={formatReportMoney(financial.vat)} />
              <SummaryMetricRow label="Total Revenue" value={formatReportMoney(financial.billTotal)} emphasize />
              <SummaryMetricRow label="Discount" value={formatReportMoney(financial.discount)} />
              {discountLines.map((line) => (
                <SummaryMetricRow
                  key={line.type}
                  label={line.type}
                  value={formatReportMoney(line.amount)}
                />
              ))}
              <SummaryMetricRow
                label="Total after discount"
                value={formatReportMoney(financial.grandTotal)}
                emphasize
              />
              <SummaryMetricRow label="Tips" value={formatReportMoney(financial.tips)} />
            </tbody>
          </table>
        </section>

        <section>
          <h2 className={sectionTitle}>Payment method breakdown</h2>
          <table className="w-full max-w-lg border-collapse">
            <thead>
              <tr>
                <th className={th}>Payment Method</th>
                <th className={`${th} text-right`}>Tenders</th>
                <th className={`${th} text-right`}>Amount taken</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className={`${td} text-center text-gray-500 py-4`}>
                    {loading ? 'Loading…' : 'No payments in range'}
                  </td>
                </tr>
              ) : (
                paymentRows.map((r) => (
                  <tr key={r.method}>
                    <td className={td}>{r.method}</td>
                    <td className={tdNum}>{r.orders}</td>
                    <td className={tdNum}>{formatReportMoney(r.totalAfterDiscount)}</td>
                  </tr>
                ))
              )}
              {paymentRows.length > 0 ? (
                <tr className="bg-gray-50">
                  <td className={`${td} font-semibold text-gray-800`}>Total</td>
                  <td className={`${tdNum} font-semibold`}>{paymentOrdersTotal}</td>
                  <td className={`${tdNum} font-semibold`}>{formatReportMoney(paymentAmountTotal)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className={sectionTitle}>Order type</h2>
          <table className="w-full max-w-lg border-collapse">
            <thead>
              <tr>
                <th className={th}>Type</th>
                <th className={`${th} text-right`}>Checks</th>
                <th className={`${th} text-right`}>Guests</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-right`}>Total after discount</th>
              </tr>
            </thead>
            <tbody>
              {orderTypeRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${td} text-center text-gray-500 py-4`}>
                    {loading ? 'Loading…' : 'No checks in range'}
                  </td>
                </tr>
              ) : (
                orderTypeRows.map((row) => (
                  <tr key={row.name}>
                    <td className={td}>{row.name}</td>
                    <td className={tdNum}>{row.checks}</td>
                    <td className={tdNum}>{row.guests}</td>
                    <td className={tdNum}>{formatReportMoney(row.total)}</td>
                    <td className={tdNum}>{formatReportMoney(row.totalAfterDiscount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
        </div>

        <section>
          <h2 className={sectionTitle}>Transaction detail</h2>
          <div className="-mx-2 print:mx-0">
            <table className="report-detail-table w-full min-w-[1680px] border-collapse print:min-w-0">
              <thead>
                <tr>
                  {[
                    'Order ID',
                    'Table',
                    'Zone',
                    'Order Type',
                    'Guests',
                    'Items',
                    'Qty',
                    'Price',
                    'Item Total',
                    'Subtotal',
                    'Service Charge',
                    'VAT',
                    'Total',
                    'Total after discount',
                    'Tip',
                    'Discount Type',
                    'Discount Amount',
                    'Payment',
                    'Card Name',
                    'Txn',
                    'Status',
                    'Opening Time',
                    'Closing Time',
                  ].map((h) => (
                    <th key={h} className={h === 'Items' ? `${th} ${itemCol}` : th}>
                      {h}
                    </th>
                  ))}
                  {onViewOrder ? (
                    <th className={`${th} print:hidden w-24`} aria-label="Actions" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={onViewOrder ? 24 : 23} className={`${td} text-center py-8 text-gray-500`}>
                      Loading line items…
                    </td>
                  </tr>
                ) : gridRows.length === 0 ? (
                  <tr>
                    <td colSpan={onViewOrder ? 24 : 23} className={`${td} text-center py-8 text-gray-500`}>
                      No transactions for the selected range.
                    </td>
                  </tr>
                ) : (
                  gridRows.map((row) => (
                    <ReportGridRowView key={row.key} row={row} onViewOrder={onViewOrder} onReopenOrder={onReopenOrder} />
                  ))
                )}
                {gridRows.length > 0 && !loading ? (
                  <tr className="bg-gray-50">
                    <td className={`${td} font-semibold text-gray-800`} colSpan={9}>
                      Column totals
                    </td>
                    <td className={tdNum}>{formatReportMoney(colTotals.subtotal)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.serviceCharge)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.vat)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.orderTotal)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.totalAfterDiscount)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.tip)}</td>
                    <td className={td} />
                    <td className={tdNum}>{formatReportMoney(colTotals.discount)}</td>
                    <td className={td} colSpan={onViewOrder ? 7 : 6} />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReportGridRowView({
  row,
  onViewOrder,
  onReopenOrder,
}: {
  row: ReportGridRow;
  onViewOrder?: (paymentId: string) => void;
  onReopenOrder?: (row: ReportGridRow) => void;
}) {
  const [printing, setPrinting] = useState(false);
  const showOrderFinancials =
    row.isOrderSummaryOnly
    || Boolean(row.payment && row.status);
  const showMoney = (n: number, force = false) => {
    if (!showOrderFinancials && !force) return '';
    if (row.isOrderSummaryOnly || n > 0) return formatReportMoney(n);
    return '—';
  };

  const handlePrintBill = async () => {
    if (!row.paymentId || printing) return;
    setPrinting(true);
    try {
      const result = await receiptsApi.print({ paymentId: row.paymentId });
      if (result.receiptPrinted) {
        toast.success('Bill printed');
      } else {
        toast.error(result.receiptPrintMessage || 'Print sent but printer did not confirm');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to print bill');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <tr className="hover:bg-gray-50/80">
      <td className={`${td} font-medium whitespace-nowrap`}>{row.orderLabel}</td>
      <td className={td}>{row.tableLabel}</td>
      <td className={`${td} whitespace-nowrap`}>{row.zoneLabel || '—'}</td>
      <td className={`${td} whitespace-nowrap`}>{row.orderTypeName || '—'}</td>
      <td className={`${td} text-center`}>{row.guests}</td>
      <td className={`${td} ${itemCol}`}>
        <span className="line-clamp-2 leading-snug break-words" title={row.itemName}>
          {row.itemName}
        </span>
      </td>
      <td className={`${td} text-center`}>{row.qty || '—'}</td>
      <td className={tdNum}>{row.qty ? formatReportMoney(row.unitPrice) : '—'}</td>
      <td className={tdNum}>{row.qty ? formatReportMoney(row.itemTotal) : '—'}</td>
      <td className={tdNum}>{showMoney(row.subtotal)}</td>
      <td className={tdNum}>{showMoney(row.serviceCharge)}</td>
      <td className={tdNum}>{showMoney(row.vat)}</td>
      <td className={tdNum}>{showMoney(row.orderTotal)}</td>
      <td className={tdNum}>{showMoney(row.totalAfterDiscount)}</td>
      <td className={tdNum}>{showMoney(row.tip)}</td>
      <td className={td}>
        {row.discountParts.length > 0 ? (
          row.discountParts.map((part) => (
            <div key={`${row.key}-${part.type}`} className="whitespace-nowrap">{part.type}</div>
          ))
        ) : (row.payment ? '—' : '')}
      </td>
      <td className={tdNum}>
        {row.discountParts.length > 0 ? (
          row.discountParts.map((part) => (
            <div key={`${row.key}-${part.type}-amt`} className="whitespace-nowrap">{formatReportMoney(part.amount)}</div>
          ))
        ) : (row.payment ? '—' : '')}
      </td>
      <td className={td}>{row.payment}</td>
      <td className={`${td} whitespace-nowrap`}>{row.cardName || (row.payment ? '—' : '')}</td>
      <td className={`${td} whitespace-nowrap`}>{row.cardNumber || (row.payment ? '—' : '')}</td>
      <td className={td}>{row.status}</td>
      <td className={`${td} whitespace-nowrap text-[10px]`}>{row.openedAt}</td>
      <td className={`${td} whitespace-nowrap text-[10px]`}>{row.closedAt}</td>
      {onViewOrder ? (
        <td className={`${td} text-center print:hidden`}>
          {row.payment && row.status ? (
            <div className="inline-flex items-center justify-center gap-0.5">
              <button
                type="button"
                title="View payment detail"
                onClick={() => onViewOrder(row.paymentId)}
                className="inline-flex p-1 rounded hover:bg-gray-200"
              >
                <Eye size={14} />
              </button>
              <button
                type="button"
                title="Print bill"
                disabled={printing}
                onClick={() => void handlePrintBill()}
                className="inline-flex p-1 rounded text-amber-600 hover:bg-amber-100 disabled:opacity-40"
              >
                <Printer size={14} />
              </button>
              {row.orderId && onReopenOrder ? (
                <button
                  type="button"
                  title="Reopen or correct payment"
                  onClick={() => onReopenOrder(row)}
                  className="inline-flex p-1 rounded hover:bg-gray-200"
                >
                  <RotateCcw size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
