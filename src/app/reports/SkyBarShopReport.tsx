'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import type { AnalyticsTransactionDetail } from '@/lib/api/types';
import {
  aggregateFinancials,
  aggregateSalesByCategoryType,
  buildReportGridRows,
  formatReportMoney,
  gridColumnTotals,
  paymentMethodBreakdown,
  type MenuCategoryLookup,
  type ReportGridRow,
} from '@/app/reports/reportDocumentHelpers';

const th =
  'border border-gray-300 bg-gray-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-600 whitespace-nowrap';
const td = 'border border-gray-300 px-3 py-2 text-[11px] text-gray-800 align-middle';
const tdNum = `${td} text-right tabular-nums whitespace-nowrap font-medium text-gray-900`;

const sectionTitle =
  'text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 border-b border-gray-300 pb-2 mb-3';

function formatReportDateLabel(iso: string): string {
  try {
    return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
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
  generatedAt: Date;
  orderDetails: AnalyticsTransactionDetail[];
  menuLookup?: MenuCategoryLookup;
  loading?: boolean;
  onViewOrder?: (paymentId: string) => void;
}

export default function SkyBarShopReport({
  dateFrom,
  dateTo,
  generatedAt,
  orderDetails,
  menuLookup,
  loading,
  onViewOrder,
}: SkyBarShopReportProps) {
  const financial = aggregateFinancials(orderDetails);
  const categorySales = aggregateSalesByCategoryType(orderDetails, menuLookup);
  const paymentRows = paymentMethodBreakdown(orderDetails);
  const gridRows = buildReportGridRows(orderDetails);
  const colTotals = gridColumnTotals(gridRows);
  const totalOrders = orderDetails.length;
  const totalGuests = orderDetails.reduce(
    (s, d) => s + (Number(d.guestCount ?? d.covers ?? 1) || 1),
    0,
  );
  const paymentOrdersTotal = paymentRows.reduce((s, r) => s + r.orders, 0);
  const paymentAmountTotal = paymentRows.reduce((s, r) => s + r.total, 0);

  const generatedStamp = generatedAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const rangeLabel = `${formatReportDateLabel(dateFrom)} — ${formatReportDateLabel(dateTo)}`;
  const categoryLineTotal = categorySales.food + categorySales.drink;

  return (
    <div className="skybar-shop-report bg-white text-gray-900 rounded-lg shadow-sm border border-gray-300 overflow-hidden print:overflow-visible print:shadow-none">
      <header className="px-8 py-6 border-b-2 border-gray-800 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500 mb-1">
              SkyBar POS
            </p>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Shop &amp; Revenue Report
            </h1>
            <p className="text-sm text-gray-600 mt-1">Period: {rangeLabel}</p>
          </div>
          <div className="text-left sm:text-right text-[11px] text-gray-500 leading-relaxed">
            <p>
              <span className="text-gray-400 uppercase tracking-wide text-[9px]">Generated</span>
              <br />
              <span className="text-gray-800 font-medium">{generatedStamp}</span>
            </p>
            <p className="mt-2 tabular-nums">
              {totalOrders} closed {totalOrders === 1 ? 'check' : 'checks'}
            </p>
          </div>
        </div>
      </header>

      <div className="px-8 py-6 space-y-8 max-h-[calc(100vh-11rem)] overflow-y-auto overflow-x-hidden print:max-h-none print:overflow-visible scrollbar-thin">
        <section>
          <h2 className={sectionTitle}>Executive summary</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <SummaryMetricRow label="Subtotal" value={formatReportMoney(financial.subtotal)} />
              <SummaryMetricRow label="Service charge" value={formatReportMoney(financial.serviceCharge)} />
              <SummaryMetricRow label="VAT" value={formatReportMoney(financial.vat)} />
              <SummaryMetricRow label="Tips" value={formatReportMoney(financial.tips)} />
              <SummaryMetricRow
                label="Grand total"
                value={formatReportMoney(financial.grandTotal)}
                emphasize
              />
            </tbody>
          </table>
        </section>

        <section>
          <h2 className={sectionTitle}>Payment method breakdown</h2>
          <table className="w-full max-w-lg border-collapse">
            <thead>
              <tr>
                <th className={th}>Payment Method</th>
                <th className={`${th} text-right`}>Orders</th>
                <th className={`${th} text-right`}>Total Amount</th>
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
                    <td className={tdNum}>{formatReportMoney(r.total)}</td>
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
          <h2 className={sectionTitle}>Transaction detail</h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr>
                  {[
                    'Order ID',
                    'Table',
                    'Guests',
                    'Items',
                    'Qty',
                    'Price',
                    'Item Total',
                    'Subtotal',
                    'Service Charge',
                    'VAT',
                    'Total',
                    'Payment',
                    'Status',
                    'Opening Time',
                    'Closing Time',
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                  {onViewOrder ? (
                    <th className={`${th} print:hidden w-10`} aria-label="Detail" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={onViewOrder ? 16 : 15} className={`${td} text-center py-8 text-gray-500`}>
                      Loading line items…
                    </td>
                  </tr>
                ) : gridRows.length === 0 ? (
                  <tr>
                    <td colSpan={onViewOrder ? 16 : 15} className={`${td} text-center py-8 text-gray-500`}>
                      No transactions for the selected range.
                    </td>
                  </tr>
                ) : (
                  gridRows.map((row) => (
                    <ReportGridRowView key={row.key} row={row} onViewOrder={onViewOrder} />
                  ))
                )}
                {gridRows.length > 0 && !loading ? (
                  <tr className="bg-gray-50">
                    <td className={`${td} font-semibold text-gray-800`} colSpan={7}>
                      Column totals
                    </td>
                    <td className={tdNum}>{formatReportMoney(colTotals.subtotal)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.serviceCharge)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.vat)}</td>
                    <td className={tdNum}>{formatReportMoney(colTotals.orderTotal)}</td>
                    <td className={td} colSpan={onViewOrder ? 5 : 4} />
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
}: {
  row: ReportGridRow;
  onViewOrder?: (paymentId: string) => void;
}) {
  const showOrderFinancials =
    row.isOrderSummaryOnly
    || Boolean(row.payment && row.status);
  const showMoney = (n: number, force = false) => {
    if (!showOrderFinancials && !force) return '';
    if (row.isOrderSummaryOnly || n > 0) return formatReportMoney(n);
    return '—';
  };
  return (
    <tr className="hover:bg-gray-50/80">
      <td className={`${td} font-medium whitespace-nowrap`}>{row.orderLabel}</td>
      <td className={td}>{row.tableLabel}</td>
      <td className={`${td} text-center`}>{row.guests}</td>
      <td className={td}>{row.itemName}</td>
      <td className={`${td} text-center`}>{row.qty || '—'}</td>
      <td className={tdNum}>{row.qty ? formatReportMoney(row.unitPrice) : '—'}</td>
      <td className={tdNum}>{row.qty ? formatReportMoney(row.itemTotal) : '—'}</td>
      <td className={tdNum}>{showMoney(row.subtotal)}</td>
      <td className={tdNum}>{showMoney(row.serviceCharge)}</td>
      <td className={tdNum}>{showMoney(row.vat)}</td>
      <td className={tdNum}>{showMoney(row.orderTotal)}</td>
      <td className={td}>{row.payment}</td>
      <td className={td}>{row.status}</td>
      <td className={`${td} whitespace-nowrap text-[10px]`}>{row.openedAt}</td>
      <td className={`${td} whitespace-nowrap text-[10px]`}>{row.closedAt}</td>
      {onViewOrder ? (
        <td className={`${td} text-center print:hidden`}>
          {row.payment && row.status ? (
            <button
              type="button"
              title="View payment detail"
              onClick={() => onViewOrder(row.paymentId)}
              className="inline-flex p-1 rounded hover:bg-gray-200"
            >
              <Eye size={14} />
            </button>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
