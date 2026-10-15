/** Cent-safe money helpers for receipt line totals. */
export function lineTotal(qty: number, unitPrice: number): number {
  const q = Number.isFinite(qty) ? qty : 0;
  const u = Number.isFinite(unitPrice) ? unitPrice : 0;
  return Math.round(q * u * 100) / 100;
}

export function formatMoney(amount: number, currencySymbol: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${currencySymbol}${Math.abs(n).toFixed(2)}`;
}
