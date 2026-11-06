import { describe, expect, test } from "vitest";
// @ts-expect-error plain ESM script outside the agent package
import { evaluate, firstFunding } from "../../scripts/eligibility-lib.mjs";

const USER = "0x00000000000000000000000000000000000000aa";
const ME = "0x00000000000000000000000000000000000000b1";
const MY_FUNDER = "0x00000000000000000000000000000000000000f1";
const STRANGER = "0x00000000000000000000000000000000000000c3";
const builder = new Map([[ME, "agent wallet"]]);
const mainFunders = new Map([[MY_FUNDER, "main funder"]]);
const row = (from: string, at: number, value = "1", what = "CELO") => ({ from, to: USER, at, value, what, hash: `0x${at}` });

describe("firstFunding", () => {
  test("earliest incoming value across CELO and tokens; zero-value and outgoing ignored", () => {
    const rows = [row(STRANGER, 300), row(ME, 100, "0"), row(MY_FUNDER, 200, "5", "USDT"), { ...row(STRANGER, 50), from: USER, to: STRANGER }];
    expect(firstFunding(USER, rows)).toMatchObject({ from: MY_FUNDER, at: 200, what: "USDT" });
    expect(firstFunding(USER, [])).toBeNull();
  });
});

describe("evaluate", () => {
  const base = { address: USER, builder, mainFunders, startLabel: "2026-10-06", isContract: false };
  test("independent: funded by a stranger, sent txs before the start", () => {
    expect(evaluate({ ...base, funding: { from: STRANGER, at: 1, what: "CELO" }, nonceAtStart: 3 }).verdict).toBe("eligible");
  });
  test("your own wallet is never eligible", () => {
    const r = evaluate({ ...base, address: ME, funding: { from: STRANGER, at: 1, what: "CELO" }, nonceAtStart: 9 });
    expect(r.verdict).toBe("not eligible");
    expect(r.checks[0].detail).toContain("agent wallet");
  });
  test("first funded by you or your main funder fails, even with a long history", () => {
    for (const from of [ME, MY_FUNDER]) {
      expect(evaluate({ ...base, funding: { from, at: 1, what: "USDT" }, fundingComplete: false, nonceAtStart: 2 }).verdict).toBe("not eligible");
    }
  });
  test("no transactions sent by the start fails", () => {
    expect(evaluate({ ...base, funding: { from: STRANGER, at: 1, what: "CELO" }, nonceAtStart: 0 }).verdict).toBe("not eligible");
  });
  test("contract wallets, unknown funding and cut-off histories need a hand check", () => {
    expect(evaluate({ ...base, isContract: true, funding: { from: STRANGER, at: 1, what: "CELO" }, nonceAtStart: 0 }).verdict).toBe("check by hand");
    expect(evaluate({ ...base, funding: null, nonceAtStart: 1 }).verdict).toBe("check by hand");
    expect(evaluate({ ...base, funding: { from: STRANGER, at: 1, what: "CELO" }, fundingComplete: false, nonceAtStart: 1 }).verdict).toBe("check by hand");
  });
});
