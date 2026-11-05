export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface Obligation {
  owner: Address;
  recipient: Address;
  sellToken: Address;
  buyToken: Address;
  buyAmount: bigint;
  maxSellAmount: bigint;
  validAfter: bigint;
  expiry: bigint;
  nonce: bigint;
}

/** One observed rate: `usdt` atomic USDT traded for `cngn` atomic cNGN. Never invented, always sourced. */
export interface RateObs {
  usdt: bigint;
  cngn: bigint;
  source: string;
  at: number;
}

export type News = "shock" | "normal" | "unknown";
export type Venue = "textile" | "uniswap";

export interface VenueQuote {
  venue: Venue;
  usdtIn: bigint;
  at: number;
}

export type Status = "pending" | "buying" | "bought" | "paid" | "expired" | "cancelled" | "failed";

export interface Lot {
  cngn: bigint;
  usdtCost: bigint;
  venue: Venue;
  boughtAt: number;
  txHash: string;
}

export interface StoredObligation {
  id: string;
  label: string;
  o: Obligation;
  sig: Hex;
  day1: RateObs;
  status: Status;
  takerAtDue: boolean;
  lot: Lot | null;
}
