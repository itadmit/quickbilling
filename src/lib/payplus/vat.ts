/**
 * VAT helpers. Default rate is 18% (Israeli VAT as of 2025).
 * Override per call when needed; settings cache should normally provide the live rate.
 */

export const DEFAULT_VAT_RATE = 0.18;

export function withVat(baseAmount: number, rate = DEFAULT_VAT_RATE): {
  base: number;
  vat: number;
  total: number;
} {
  const base = round2(baseAmount);
  const vat = round2(base * rate);
  const total = round2(base + vat);
  return { base, vat, total };
}

export function fromTotal(total: number, rate = DEFAULT_VAT_RATE): {
  base: number;
  vat: number;
  total: number;
} {
  const base = round2(total / (1 + rate));
  const vat = round2(total - base);
  return { base, vat, total: round2(total) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
