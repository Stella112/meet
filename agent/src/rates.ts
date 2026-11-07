import type { RateObs, VenueQuote } from "./types.js";

// Rate board sold through the x402 gate: what $1 buys in naira right now on each venue, at three sizes,
// plus the latest manual street rate. Read-only; quotes come from the agent's existing quote paths.
export const BOARD_SIZES_NGN = [1_400n, 14_000n, 138_000n];

export interface BoardRow {
  naira: number;
  textile: { usdtIn: string; nairaPerUsd: number } | null;
  uniswap: { usdtIn: string; nairaPerUsd: number } | null;
  best: "textile" | "uniswap" | null;
  /** How much cheaper the best venue is than the other, in basis points; null if only one quoted. */
  spreadBps: number | null;
}

const side = (q: VenueQuote | null, cngn: bigint) => (q && q.usdtIn > 0n ? { usdtIn: q.usdtIn.toString(), nairaPerUsd: Number(cngn) / Number(q.usdtIn) } : null);

export function boardRow(naira: bigint, t: VenueQuote | null, u: VenueQuote | null): BoardRow {
  const cngn = naira * 1_000_000n;
  const textile = side(t, cngn);
  const uniswap = side(u, cngn);
  let best: BoardRow["best"] = null;
  let spreadBps: number | null = null;
  if (t && u && t.usdtIn > 0n && u.usdtIn > 0n) {
    best = t.usdtIn <= u.usdtIn ? "textile" : "uniswap";
    const [lo, hi] = t.usdtIn <= u.usdtIn ? [t.usdtIn, u.usdtIn] : [u.usdtIn, t.usdtIn];
    spreadBps = Number(((hi - lo) * 10_000n) / lo);
  } else if (textile) best = "textile";
  else if (uniswap) best = "uniswap";
  return { naira: Number(naira), textile, uniswap, best, spreadBps };
}

export function board(at: number, rows: BoardRow[], street: RateObs | null, streetFresh: boolean) {
  return {
    source: "Meet (usemeet.website), Celo mainnet quotes: Textile RFQ preview and Uniswap v3 QuoterV2, USD₮ in for exact cNGN out",
    at,
    rows,
    street: street ? { nairaPerUsd: Number(street.cngn) / Number(street.usdt), source: street.source, at: street.at, fresh: streetFresh } : null,
    note: "Indicative. Textile's firm-quote minimum is ₦1,377.41; the smallest row may only be fillable on Uniswap.",
  };
}
