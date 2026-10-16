'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import type { AnalyticsTransactionDetail } from '@/lib/api/types';
import {
  aggregateFinancials,
  buildReportGridRows,
  formatReportMoney,
  gridColumnTotals,
  paymentMethodBreakdown,
  type ReportGridRow,
} from '@/app/reports/reportDocumentHelpers';

const th =
  'border border-gray-400 bg-gray-100 px-2 py-1.5 text-left text-[11px] font-semibold text-gray-900 whitespace-nowrap';
const td = 'border border-gray-400 px-2 py-1 text-[11px] text-gray-900 align-top';
const tdNum = `${td} text-right tabular-nums whitespace-nowrap`;

interface SkyBarShopReportProps {
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  orderDetails: AnalyticsTransactionDetail[];
  loading?: boolean;
  onViewOrder?: (paymentId: string) => void;
}

function formatRangeDate(d: string) {
  return d;
}

export default function SkyBarShopReport({
  dateFrom,
  dateTo,
  generatedAt,
  orderDetails,
  loading,
  onViewOrder,
}: SkyBarShopReportProps) {
  const financial = aggregateFinancials(orderDetails);
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

  const generatedLabel = generatedAt.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="skybar-shop-report bg-white text-black rounded-lg shadow-sm border border-gray-300 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-400">
        <p className="text-[10px] text-gray-500 mb-2 print:text-gray-600">
          {generatedAt.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
        <h2 className="text-center text-xl font-bold tracking-tight text-gray-900 uppercase">
          SkyBar Report
        </h2>
        <p className="text-center text-sm text-gray-700 mt-2">
          Date Range: {formatRangeDate(dateFrom)} to {formatRangeDate(dateTo)}
        </p>
        <p className="text-center text-sm text-gray-600">Generated on: {generatedLabel}</p>
      </div>

      <div className="px-6 py-4 space-y-5">
        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">Summary</h3>
          <p className="text-sm text-gray-800">
            Total Orders: <span className="font-semibold">{totalOrders}</span>
          </p>
          <p className="text-sm text-gray-800">
            Total Guests: <span className="font-semibold">{totalGuests}</span>
          </p>
        </section>

        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">Financial Summary</h3>
          <table className="w-full max-w-md border-collapse">
            <tbody>
              {[
                ['Subtotal', financial.subtotal],
                ['Service Charge', financial.serviceCharge],
                ['VAT', financial.vat],
                ['Tips', financial.tips],
                ['Grand Total', financial.grandTotal],
              ].map(([label, val]) => (
                <tr key={String(label)}>
                  <td className={`${td} font-medium w-40`}>{label}</td>
                  <td className={`${tdNum} font-semibold`}>{formatReportMoney(Number(val))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">Payment Method Breakdown</h3>
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
                <tr className="font-bold bg-gray-50">
                  <td className={td}>TOTAL</td>
                  <td className={tdNum}>{paymentOrdersTotal}</td>
                  <td className={tdNum}>{formatReportMoney(paymentAmountTotal)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="text-sm font-bold text-gray-900 mb-2">Transaction Details</h3>
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
                  <tr className="font-bold bg-gray-100">
                    <td className={td} colSpan={7}>
                      TOTALS:
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
