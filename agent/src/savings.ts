import type { RateObs } from "./types.js";

export interface Saving {
  /** Atomic cNGN better (positive) or worse (negative) than the baseline. */
  cngn: bigint;
  source: string;
  at: number;
}

/** The dollars paid would have bought `paid * rate` at the baseline; savings is what was delivered above that. */
export function savedAgainst(delivered: bigint, paidUsdt: bigint, baseline: RateObs | null): Saving | null {
  if (!baseline || baseline.usdt <= 0n) return null;
  return {
    cngn: delivered - (paidUsdt * baseline.cngn) / baseline.usdt,
    source: baseline.source,
    at: baseline.at,
  };
}

/** USDT the same cNGN would cost at a baseline rate. */
export function costAt(cngn: bigint, baseline: RateObs): bigint {
  return (cngn * baseline.usdt) / baseline.cngn;
}

export function formatSaving(s: Saving | null): string {
  if (!s) return "no data";
  const naira = Number(s.cngn) / 1e6;
  const word = naira >= 0 ? "better" : "worse";
  return `₦${Math.abs(naira).toFixed(2)} ${word} (${s.source}, ${new Date(s.at * 1000).toISOString()})`;
}
