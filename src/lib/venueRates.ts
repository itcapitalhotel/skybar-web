import { configApi } from '@/lib/api/client';

/** Posted venue defaults: service charge 5% of net, VAT 10% of (net + service). */
export const DEFAULT_SERVICE_CHARGE_PERCENT = 5;
export const DEFAULT_VAT_PERCENT = 10;

export interface VenueRates {
  serviceChargePercent: number;
  vatPercent: number;
}

export const DEFAULT_VENUE_RATES: VenueRates = {
  serviceChargePercent: DEFAULT_SERVICE_CHARGE_PERCENT,
  vatPercent: DEFAULT_VAT_PERCENT,
};

export function parsePercent(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function venueRatesFromConfig(config?: { serviceCharge?: unknown; vatRate?: unknown } | null): VenueRates {
  return {
    serviceChargePercent: parsePercent(config?.serviceCharge, DEFAULT_SERVICE_CHARGE_PERCENT),
    vatPercent: parsePercent(config?.vatRate, DEFAULT_VAT_PERCENT),
  };
}

export function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function applyVenueRates(subtotal: number, rates: VenueRates = DEFAULT_VENUE_RATES) {
  const net = roundMoney(subtotal);
  const serviceCharge = roundMoney((net * rates.serviceChargePercent) / 100);
  const vat = roundMoney(((net + serviceCharge) * rates.vatPercent) / 100);
  return {
    subtotal: net,
    serviceCharge,
    vat,
    total: roundMoney(net + serviceCharge + vat),
  };
}

/** SC 5% + VAT 10% on (net+SC) => 1.05 * 1.10 = 1.155 */
export function venueGrossMultiplier(rates: VenueRates = DEFAULT_VENUE_RATES): number {
  return (1 + rates.serviceChargePercent / 100) * (1 + rates.vatPercent / 100);
}

export async function loadVenueRates(): Promise<VenueRates> {
  try {
    const config = await configApi.get();
    return venueRatesFromConfig(config);
  } catch {
    return DEFAULT_VENUE_RATES;
  }
}
