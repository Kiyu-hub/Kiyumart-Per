// Simplified currency handling: platform uses GHS only.
// Remove external exchange rate fetching and make conversions no-ops.

export const DEFAULT_CURRENCY = "GHS";

export type ExchangeRates = { [key: string]: number };

export async function getExchangeRates(base: string = DEFAULT_CURRENCY): Promise<ExchangeRates> {
  // Always return GHS as the only supported rate (identity)
  return { GHS: 1 };
}

export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  // No conversion performed: treat all values as GHS
  return amount;
}

export const SUPPORTED_CURRENCIES = ["GHS"];
