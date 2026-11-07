import { describe, expect, test } from "vitest";
import { board, boardRow } from "../src/rates.js";

const q = (venue: "textile" | "uniswap", usdtIn: bigint) => ({ venue, usdtIn, at: 1 });

describe("boardRow", () => {
  test("picks the cheaper venue and the spread in bps", () => {
    const r = boardRow(1_400n, q("textile", 1_016_422n), q("uniswap", 1_016_114n));
    expect(r.best).toBe("uniswap");
    expect(r.spreadBps).toBe(3); // (1016422-1016114)/1016114 = 3.03 bps, floored
    expect(r.uniswap!.nairaPerUsd).toBeCloseTo(1_400_000_000 / 1_016_114, 6);
  });
  test("one venue missing: no spread, the other is best", () => {
    expect(boardRow(1_400n, null, q("uniswap", 1n))).toMatchObject({ best: "uniswap", spreadBps: null, textile: null });
    expect(boardRow(1_400n, null, null)).toMatchObject({ best: null, spreadBps: null });
  });
});

describe("board", () => {
  test("includes the street rate and whether it is fresh", () => {
    const b = board(5, [], { usdt: 1_000_000n, cngn: 1_395_000_000n, source: "manual: BDC", at: 4 }, true);
    expect(b.street).toEqual({ nairaPerUsd: 1395, source: "manual: BDC", at: 4, fresh: true });
    expect(board(5, [], null, false).street).toBeNull();
  });
});
