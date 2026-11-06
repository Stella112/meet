import { timingSafeEqual } from "node:crypto";
import type { RateObs } from "./types.js";

// Street rate: entered by hand once a day (no catalog service sells it). It is the naira you would get
// for $1 selling dollars on the street (a BDC's buy price), so receipts compare like with like.
export const MIN_NAIRA_PER_USD = 500;
export const MAX_NAIRA_PER_USD = 5000;

/** Validates a manual entry. Returns the observation, or a reason it was refused. */
export function streetEntry(rate: unknown, source: unknown, now: number): RateObs | string {
  const n = typeof rate === "string" ? Number(rate.replace(/[₦,\s]/g, "")) : typeof rate === "number" ? rate : NaN;
  if (!Number.isFinite(n) || n < MIN_NAIRA_PER_USD || n > MAX_NAIRA_PER_USD) return `rate must be ₦${MIN_NAIRA_PER_USD}–₦${MAX_NAIRA_PER_USD} per $1`;
  const src = typeof source === "string" ? source.trim() : "";
  if (src.length < 2 || src.length > 80 || /[\u0000-\u001f]/.test(src)) return "source must be 2–80 characters, e.g. 'BDC, Wuse Abuja'";
  return { usdt: 1_000_000n, cngn: BigInt(Math.round(n * 100)) * 10_000n, source: `manual: ${src}`, at: now };
}

/** A missed daily entry means "no data", never a stale rate presented as today's. */
export function freshStreet(obs: RateObs | null, now: number, maxAgeHours: number): RateObs | null {
  if (!obs) return null;
  return now - obs.at <= maxAgeHours * 3600 ? obs : null;
}

/** Constant-time bearer check. With no token configured, entry over HTTP is disabled. */
export function tokenOk(header: string | undefined, token: string | undefined): boolean {
  if (!token || token.length < 16 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
