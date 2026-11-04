import { describe, expect, test } from "vitest";
import { isLive, loadConfig } from "../src/config.js";
import { decide } from "../src/decision.js";
import { canBuy, canSpend, holdExceeded, stopLossHit } from "../src/guard.js";
import { grossUp, route, uniswapMaxIn } from "../src/router.js";
import { costAt, formatSaving, savedAgainst } from "../src/savings.js";
import type { VenueQuote } from "../src/types.js";

const base = {
  now: 1000 * 3600,
  validAfter: 0,
  expiry: 2000 * 3600,
  bufferHours: 12,
  earlyEdgeBps: 50,
  news: "normal" as const,
  costNow: 10_000n,
  costDay1: 10_000n,
  takerAtDue: false,
};

describe("decision", () => {
  test("waits without a trigger", () => expect(decide(base)).toEqual({ act: false, rule: "wait" }));
  test("shock converts now", () => expect(decide({ ...base, news: "shock" }).rule).toBe("news_shock"));
  test("unknown news does not convert", () => expect(decide({ ...base, news: "unknown" }).act).toBe(false));
  test("buffer boundary is inclusive", () => {
    const at = base.expiry - 12 * 3600;
    expect(decide({ ...base, now: at }).rule).toBe("buffer_reached");
    expect(decide({ ...base, now: at - 1 }).rule).toBe("wait");
  });
  test("early edge boundary at exactly 50 bps", () => {
    expect(decide({ ...base, costNow: 9950n }).rule).toBe("early_edge");
    expect(decide({ ...base, costNow: 9951n }).rule).toBe("wait");
  });
  test("before window and after expiry never act", () => {
    expect(decide({ ...base, validAfter: base.now + 1, news: "shock" }).rule).toBe("window_closed");
    expect(decide({ ...base, now: base.expiry, news: "shock" }).rule).toBe("expired");
  });
  test("after stop rule only due time buys", () => {
    expect(decide({ ...base, takerAtDue: true, news: "shock", costNow: 1n }).act).toBe(false);
    expect(decide({ ...base, takerAtDue: true, now: base.expiry - 3600 }).rule).toBe("buffer_reached");
  });
});

describe("router", () => {
  const q = (venue: "textile" | "uniswap", usdtIn: bigint): VenueQuote => ({ venue, usdtIn, at: 0 });
  test("cheaper venue wins, Textile on tie", () => {
    expect(route(q("textile", 100n), q("uniswap", 99n), 1000n, 0)).toMatchObject({ ok: true, quote: { venue: "uniswap" } });
    expect(route(q("textile", 99n), q("uniswap", 100n), 1000n, 0)).toMatchObject({ ok: true, quote: { venue: "textile" } });
    expect(route(q("textile", 100n), q("uniswap", 100n), 1000n, 0)).toMatchObject({ ok: true, quote: { venue: "textile" } });
  });
  test("falls back to whichever quoted", () => {
    expect(route(null, q("uniswap", 99n), 1000n, 0)).toMatchObject({ ok: true, quote: { venue: "uniswap" } });
    expect(route(null, null, 1000n, 0)).toEqual({ ok: false, reason: "no_quote" });
  });
  test("worst rate includes the fee", () => {
    expect(grossUp(9990n, 10)).toBe(10000n);
    expect(route(q("textile", 9990n), null, 10000n, 10).ok).toBe(true);
    expect(route(q("textile", 9991n), null, 10000n, 10)).toMatchObject({ ok: false, reason: "above_worst_rate" });
  });
  test("grossUp always nets the supplier at least cost", () => {
    for (const cost of [1n, 7n, 999n, 12_345_678n]) {
      const gross = grossUp(cost, 10);
      expect(gross - (gross * 10n) / 10_000n >= cost).toBe(true);
    }
  });
  test("uniswap slippage cap", () => expect(uniswapMaxIn(10_000n, 50)).toBe(10_050n));
});

describe("guard", () => {
  const cfg = { PAUSED: false, MAX_OBLIGATION_USD: 25_000_000n, MAX_AGENT_CNGN_EXPOSURE_USD: 100_000_000n, MAX_DAILY_SERVICE_SPEND_USD: 2_000_000n };
  test("caps", () => {
    expect(canBuy(cfg, 25_000_000n, 75_000_000n)).toBeNull();
    expect(canBuy(cfg, 25_000_001n, 0n)).toBe("obligation_cap");
    expect(canBuy(cfg, 25_000_000n, 75_000_001n)).toBe("exposure_cap");
    expect(canBuy({ ...cfg, PAUSED: true }, 1n, 0n)).toBe("paused");
  });
  test("spend cap", () => {
    expect(canSpend(cfg, 1_995_000n, 5_000n)).toBe(true);
    expect(canSpend(cfg, 1_995_001n, 5_000n)).toBe(false);
    expect(canSpend({ ...cfg, PAUSED: true }, 0n, 1n)).toBe(false);
  });
  test("hold timer and stop loss", () => {
    expect(holdExceeded(0, 30 * 60, 30)).toBe(false);
    expect(holdExceeded(0, 30 * 60 + 1, 30)).toBe(true);
    expect(stopLossHit(10_000n, 9_850n, 150)).toBe(false);
    expect(stopLossHit(10_000n, 9_849n, 150)).toBe(true);
    expect(stopLossHit(10_000n, 10_500n, 150)).toBe(false);
  });
  test("live needs both flags; default is dry-run", () => {
    expect(loadConfig({}).DRY_RUN).toBe(true);
    expect(isLive(loadConfig({}))).toBe(false);
    expect(isLive(loadConfig({ DRY_RUN: "false" }))).toBe(false);
    expect(isLive(loadConfig({ LIVE_ACK: "i-understand-real-money" }))).toBe(false);
    expect(isLive(loadConfig({ DRY_RUN: "false", LIVE_ACK: "yes" }))).toBe(false);
    expect(isLive(loadConfig({ DRY_RUN: "false", LIVE_ACK: "i-understand-real-money" }))).toBe(true);
  });
});

describe("savings", () => {
  const obs = { usdt: 1_000_000n, cngn: 1375_000_000n, source: "manual", at: 1_800_000_000 };
  test("better and worse", () => {
    expect(savedAgainst(1380_000_000n, 1_000_000n, obs)!.cngn).toBe(5_000_000n);
    expect(savedAgainst(1370_000_000n, 1_000_000n, obs)!.cngn).toBe(-5_000_000n);
  });
  test("missing source shows no data, never a number", () => {
    expect(savedAgainst(1n, 1n, null)).toBeNull();
    expect(formatSaving(null)).toBe("no data");
  });
  test("format shows source and time", () => {
    const s = formatSaving(savedAgainst(1380_000_000n, 1_000_000n, obs));
    expect(s).toContain("₦5.00 better");
    expect(s).toContain("manual");
    expect(s).toContain("2027");
  });
  test("costAt", () => expect(costAt(1375_000_000n, obs)).toBe(1_000_000n));
});
