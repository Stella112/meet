import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "./config.js";
import { DryRunExecutor } from "./dryExecutor.js";
import { CNGN, USDT } from "./eip712.js";
import type { Deps } from "./engine.js";
import { Store } from "./store.js";
import type { Address, News, StoredObligation, Venue } from "./types.js";

// DEMO FIXTURES. All rates here are made up for tests and labelled "demo"; nothing is live.
export const T0 = 1_800_000_000;
export const HOUR = 3600;
export const DAY = 24 * HOUR;
export const RATE = 1380n; // demo cNGN per USDT
export const testAccount = privateKeyToAccount(`0x${"a11ce".padStart(64, "0")}`); // public, never funded
export const PAYEE: Address = "0x0000000000000000000000000000000000000b0b";

export function makeObligation(id: string, usd: bigint, over: Partial<StoredObligation["o"]> = {}, label = id): StoredObligation {
  const buyAmount = usd * 1_000_000n * RATE;
  return {
    id,
    label,
    o: {
      owner: testAccount.address,
      recipient: PAYEE,
      sellToken: USDT,
      buyToken: CNGN,
      buyAmount,
      maxSellAmount: (usd * 1_000_000n * 103n) / 100n,
      validAfter: BigInt(T0),
      expiry: BigInt(T0 + 3 * DAY),
      nonce: BigInt(id.length * 1000 + id.charCodeAt(0)),
      ...over,
    },
    sig: "0x",
    day1: { usdt: 1_000_000n, cngn: RATE * 1_000_000n, source: "demo", at: T0 - DAY },
    status: "pending",
    takerAtDue: false,
    lot: null,
  };
}

export interface World {
  now: number;
  /** cNGN per USDT each venue offers; null means no quote. */
  textile: bigint | null;
  uniswap: bigint | null;
  sellBackRate: bigint | null;
  news: News;
  newsThrows: boolean;
  newsCalls: number;
  balance: bigint;
  allowance: bigint;
  cancelled: Set<string>;
  told: string[];
}

export function makeDeps(env: Record<string, string> = {}): { d: Deps; w: World; exec: DryRunExecutor } {
  const w: World = {
    now: T0,
    textile: RATE,
    uniswap: RATE - 1n,
    sellBackRate: RATE,
    news: "normal",
    newsThrows: false,
    newsCalls: 0,
    balance: 1_000_000_000n,
    allowance: 1_000_000_000n,
    cancelled: new Set(),
    told: [],
  };
  const exec = new DryRunExecutor(() => w.now);
  const quote = (venue: Venue, rate: bigint | null, cngn: bigint) =>
    rate ? { venue, usdtIn: cngn / rate, at: w.now } : null;
  const d: Deps = {
    cfg: loadConfig(env),
    store: new Store(),
    exec,
    quotes: {
      textileBuy: async (c) => quote("textile", w.textile, c),
      uniswapBuy: async (c) => quote("uniswap", w.uniswap, c),
      sellBack: async (c) => (w.sellBackRate ? { venue: "textile", usdtOut: c / w.sellBackRate } : null),
    },
    chain: {
      ownerFunds: async () => ({ balance: w.balance, allowance: w.allowance }),
      isCancelled: async (o) => w.cancelled.has(o.id),
    },
    senses: {
      newsPrice: 5000n,
      news: async () => {
        w.newsCalls++;
        if (w.newsThrows) throw new Error("gateway 500");
        return { value: w.news, tx: "dry-run-news" };
      },
    },
    notify: { tell: (o, m) => w.told.push(`${o.id}: ${m}`) },
  };
  return { d, w, exec };
}
