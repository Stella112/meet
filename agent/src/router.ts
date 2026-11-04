import type { VenueQuote } from "./types.js";

const BPS = 10_000n;

/** Owner's total so the supplier nets exactly `cost` after the protocol fee (rounded up). */
export function grossUp(cost: bigint, feeBps: number): bigint {
  const keep = BPS - BigInt(feeBps);
  return (cost * BPS + keep - 1n) / keep;
}

export type RouteResult =
  | { ok: true; quote: VenueQuote; sellAmount: bigint; reason: string }
  | { ok: false; reason: "no_quote" | "above_worst_rate"; quote?: VenueQuote };

/** Cheapest venue wins; Textile on a tie. Rejected when the owner would pay above the signed worst rate. */
export function route(
  textile: VenueQuote | null,
  uniswap: VenueQuote | null,
  maxSellAmount: bigint,
  feeBps: number,
): RouteResult {
  const best =
    textile && uniswap ? (uniswap.usdtIn < textile.usdtIn ? uniswap : textile) : (textile ?? uniswap);
  if (!best) return { ok: false, reason: "no_quote" };
  const sellAmount = grossUp(best.usdtIn, feeBps);
  if (sellAmount > maxSellAmount) return { ok: false, reason: "above_worst_rate", quote: best };
  const reason =
    textile && uniswap
      ? `textile=${textile.usdtIn} uniswap=${uniswap.usdtIn}`
      : `only ${best.venue} quoted: ${best.usdtIn}`;
  return { ok: true, quote: best, sellAmount, reason };
}

/** amountInMaximum for an exact-output Uniswap swap. */
export function uniswapMaxIn(quoted: bigint, slippageBps: number): bigint {
  return (quoted * (BPS + BigInt(slippageBps))) / BPS;
}
