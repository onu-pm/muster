export type Regime = "old" | "new";

export interface SlabBand {
  upTo: number | null; // null = no upper bound
  rate: number; // 0..1
}

/**
 * Capability: TDS slab computation. Plain arithmetic, no LLM involved — the
 * numbers below came from the openaccountants `india-payroll` reference
 * skill (.claude/skills/india-payroll), then checked against a primary
 * source before landing here, per its own "source-cited draft" disclaimer:
 *
 * - New/old regime slabs, standard deduction, 87A rebate (new regime),
 *   4% cess: verified against incometaxindia.gov.in ("Key Highlights of
 *   Finance Act, 2025") and PIB press release PRID=2098406 (both FY
 *   2025-26 / AY 2026-27).
 * - Old-regime 87A rebate (≤ ₹5L, up to ₹12,500): a long-standing,
 *   unchanged figure — not independently re-checked this pass; verify
 *   before relying on it for a real filing.
 */
export const NEW_REGIME_SLABS: SlabBand[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: null, rate: 0.3 },
];

export const OLD_REGIME_SLABS: SlabBand[] = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 0.05 },
  { upTo: 1000000, rate: 0.2 },
  { upTo: null, rate: 0.3 },
];

export const CESS_RATE = 0.04;
export const NEW_REGIME_STANDARD_DEDUCTION = 75000;
export const NEW_REGIME_REBATE_LIMIT = 1200000;
export const NEW_REGIME_REBATE_MAX = 60000;
export const OLD_REGIME_REBATE_LIMIT = 500000;
export const OLD_REGIME_REBATE_MAX = 12500;

/** Annual tax (post-rebate, post-cess) for a given taxable income and regime. */
export function computeAnnualTax(taxableIncome: number, regime: Regime): number {
  const slabs = regime === "new" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;

  let tax = 0;
  let lowerBound = 0;
  for (const band of slabs) {
    if (taxableIncome <= lowerBound) break;
    const upper = band.upTo ?? Infinity;
    const taxableInBand = Math.min(taxableIncome, upper) - lowerBound;
    tax += taxableInBand * band.rate;
    lowerBound = upper;
  }

  const rebateLimit = regime === "new" ? NEW_REGIME_REBATE_LIMIT : OLD_REGIME_REBATE_LIMIT;
  const rebateMax = regime === "new" ? NEW_REGIME_REBATE_MAX : OLD_REGIME_REBATE_MAX;
  if (taxableIncome <= rebateLimit) {
    tax = Math.max(0, tax - Math.min(tax, rebateMax));
  }

  return Math.round(tax + tax * CESS_RATE);
}
