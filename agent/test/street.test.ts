import { describe, expect, test } from "vitest";
import { runBatch } from "../src/engine.js";
import { DAY, HOUR, makeDeps, makeObligation, T0 } from "../src/fixtures.js";
import { freshStreet, streetEntry, tokenOk } from "../src/street.js";

describe("streetEntry", () => {
  test("accepts a plain or formatted rate and keeps the source", () => {
    expect(streetEntry(1395, "BDC, Wuse Abuja", 100)).toEqual({ usdt: 1_000_000n, cngn: 1_395_000_000n, source: "manual: BDC, Wuse Abuja", at: 100 });
    expect(streetEntry("₦1,402.50", "Lagos BDC", 1)).toMatchObject({ cngn: 1_402_500_000n });
  });
  test("refuses nonsense", () => {
    for (const r of [0, 49, 9999, "abc", null, Number.NaN]) expect(typeof streetEntry(r, "BDC", 1)).toBe("string");
    expect(typeof streetEntry(1400, "", 1)).toBe("string");
    expect(typeof streetEntry(1400, "x".repeat(81), 1)).toBe("string");
    expect(typeof streetEntry(1400, "bad\nsource", 1)).toBe("string");
  });
});

describe("freshStreet", () => {
  const obs = { usdt: 1_000_000n, cngn: 1_400_000_000n, source: "manual: x", at: 1000 };
  test("fresh within the limit, null after it", () => {
    expect(freshStreet(obs, 1000 + 30 * HOUR, 30)).toBe(obs);
    expect(freshStreet(obs, 1000 + 30 * HOUR + 1, 30)).toBeNull();
    expect(freshStreet(null, 1, 30)).toBeNull();
  });
});

describe("tokenOk", () => {
  const token = "s3cret-token-0123456789";
  test("needs the exact bearer token, and a token configured at all", () => {
    expect(tokenOk(`Bearer ${token}`, token)).toBe(true);
    expect(tokenOk(`Bearer ${token}x`, token)).toBe(false);
    expect(tokenOk(token, token)).toBe(false);
    expect(tokenOk(undefined, token)).toBe(false);
    expect(tokenOk("Bearer ", undefined)).toBe(false);
    expect(tokenOk("Bearer short", "short")).toBe(false);
  });
});

describe("receipts use the street rate only when it is fresh", () => {
  const due = T0 + 3 * DAY;
  test("entered the same day: receipt compares against it", async () => {
    const { d } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    d.store.setStreet({ usdt: 1_000_000n, cngn: 1_375_000_000n, source: "manual: BDC", at: due - 12 * HOUR });
    await runBatch(d, due - 11 * HOUR);
    expect(d.store.ledger()[0].vsStreet).toContain("manual: BDC");
  });
  test("entered three days ago: no data", async () => {
    const { d } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    d.store.setStreet({ usdt: 1_000_000n, cngn: 1_375_000_000n, source: "manual: BDC", at: T0 });
    await runBatch(d, due - 11 * HOUR);
    expect(d.store.ledger()[0].vsStreet).toBe("no data");
  });
});
