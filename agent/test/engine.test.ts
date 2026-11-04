import { describe, expect, test } from "vitest";
import { hashTypedData, zeroAddress } from "viem";
import { CNGN, domain, obligationTypes, validateObligation } from "../src/eip712.js";
import { runBatch } from "../src/engine.js";
import { DAY, HOUR, makeDeps, makeObligation, RATE, T0, testAccount } from "../src/fixtures.js";

const due = T0 + 3 * DAY;
const atBuffer = due - 11 * HOUR;

describe("engine", () => {
  test("pays at buffer via the cheaper venue, ledger has both baselines", async () => {
    const { d, w } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    const [row] = d.store.ledger();
    expect(d.store.get("a")!.status).toBe("paid");
    expect(row.venue).toBe("textile");
    expect(row.rule).toBe("buffer_reached");
    expect(row.vsStreet).toBe("no data");
    expect(row.vsDay1).toContain("demo");
    expect(row.settleTx).toMatch(/^dry-run-/);
  });

  test("kill switch stops everything, including paid calls", async () => {
    const { d, w, exec } = makeDeps({ PAUSED: "true" });
    d.store.add(makeObligation("a", 10n));
    await runBatch(d, atBuffer);
    expect(exec.actions).toEqual([]);
    expect(w.newsCalls).toBe(0);
  });

  test("above worst rate does not convert and tells the user", async () => {
    const { d, w, exec } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    w.textile = RATE / 2n;
    w.uniswap = RATE / 2n;
    await runBatch(d, atBuffer);
    expect(exec.actions).toEqual([]);
    expect(d.store.get("a")!.status).toBe("pending");
    expect(w.told[0]).toContain("worst rate");
  });

  test("short allowance skips before buying", async () => {
    const { d, w, exec } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    w.allowance = 0n;
    await runBatch(d, atBuffer);
    expect(exec.actions).toEqual([]);
    expect(w.told[0]).toContain("short");
  });

  test("over the single-obligation cap never buys", async () => {
    const { d } = makeDeps();
    d.store.add(makeObligation("big", 26n));
    await runBatch(d, atBuffer);
    expect(d.store.events("big").some((e) => e.kind === "guard_block" && e.detail === "obligation_cap")).toBe(true);
  });

  test("exposure cap counts cNGN already held", async () => {
    const { d, exec, w } = makeDeps({ MAX_AGENT_CNGN_EXPOSURE_USD: "15" });
    exec.failNextSettles = 100;
    d.store.add(makeObligation("a", 10n));
    d.store.add(makeObligation("bb", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("bought");
    expect(d.store.get("bb")!.status).toBe("pending");
  });

  test("news checked once across a batch, TTL respected, failure not retried", async () => {
    const { d, w } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    d.store.add(makeObligation("bb", 10n));
    await runBatch(d, T0 + HOUR);
    await runBatch(d, T0 + HOUR + 60);
    expect(w.newsCalls).toBe(1);

    const f = makeDeps();
    f.d.store.add(makeObligation("a", 10n));
    f.w.newsThrows = true;
    await runBatch(f.d, T0 + HOUR);
    await runBatch(f.d, T0 + HOUR + 60);
    expect(f.w.newsCalls).toBe(1);
    expect(f.d.store.spentOn(new Date((T0 + HOUR) * 1000).toISOString().slice(0, 10))).toBe(5000n);
  });

  test("spend cap stops news and reads as unknown", async () => {
    const { d, w } = makeDeps({ MAX_DAILY_SERVICE_SPEND_USD: "0.001" });
    d.store.add(makeObligation("a", 10n));
    w.news = "shock";
    await runBatch(d, T0 + HOUR);
    expect(w.newsCalls).toBe(0);
    expect(d.store.get("a")!.status).toBe("pending");
  });

  test("news shock converts early", async () => {
    const { d, w } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    w.news = "shock";
    await runBatch(d, T0 + HOUR);
    expect(d.store.ledger()[0].rule).toBe("news_shock");
  });
});

describe("recovery", () => {
  test("settle failure keeps cNGN, retries, never buys twice", async () => {
    const { d, w, exec } = makeDeps();
    exec.failNextSettles = 1;
    d.store.add(makeObligation("a", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("bought");
    w.now += 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("paid");
    expect(exec.actions.filter((a) => a.startsWith("WOULD buy"))).toHaveLength(1);
  });

  test("hold timer unwinds, tells the user, does not rebuy", async () => {
    const { d, w, exec } = makeDeps();
    exec.failNextSettles = 100;
    d.store.add(makeObligation("a", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    w.now += 31 * 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("failed");
    expect(w.told).toContain("a: Not paid, no funds moved.");
    expect(d.store.events("a").some((e) => e.kind === "unwound" && e.detail.includes("pnl="))).toBe(true);
    expect(exec.actions.filter((a) => a.startsWith("WOULD buy"))).toHaveLength(1);
  });

  test("cancel while holding unwinds", async () => {
    const { d, w, exec } = makeDeps();
    exec.failNextSettles = 100;
    d.store.add(makeObligation("a", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    w.cancelled.add("a");
    w.now += 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("cancelled");
    expect(exec.actions.some((a) => a.startsWith("WOULD sell"))).toBe(true);
  });

  test("no sell quote keeps inventory open and retries unwinding", async () => {
    const { d, w, exec } = makeDeps();
    exec.failNextSettles = 100;
    d.store.add(makeObligation("a", 10n));
    w.now = atBuffer;
    await runBatch(d, w.now);
    w.sellBackRate = null;
    w.now += 31 * 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("bought");
    w.sellBackRate = RATE;
    w.now += 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("failed");
  });

  test("stop rule sells and switches to taker at due time", async () => {
    const { d, w, exec } = makeDeps();
    exec.failNextSettles = 1;
    w.news = "shock";
    d.store.add(makeObligation("a", 10n));
    w.now = T0 + HOUR;
    await runBatch(d, w.now);
    w.sellBackRate = (RATE * 102n) / 100n;
    w.now += 60;
    await runBatch(d, w.now);
    const o = d.store.get("a")!;
    expect(o.status).toBe("pending");
    expect(o.takerAtDue).toBe(true);
    w.now += 60;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("pending");
    w.now = atBuffer;
    await runBatch(d, w.now);
    expect(d.store.get("a")!.status).toBe("paid");
  });

  test("expiry unpaid tells the user", async () => {
    const { d, w } = makeDeps();
    d.store.add(makeObligation("a", 10n));
    await runBatch(d, due);
    expect(d.store.get("a")!.status).toBe("expired");
    expect(w.told).toContain("a: Not paid, no funds moved.");
  });
});

describe("intents", () => {
  const settlement = "0x00000000000000000000000000000000000ab370" as const;
  const ctx = { settlement, chainId: 31337, now: T0, maxUsd: 25_000_000n };
  const sign = (o: ReturnType<typeof makeObligation>["o"]) =>
    testAccount.signTypedData({ domain: domain(settlement, 31337), types: obligationTypes, primaryType: "Obligation", message: o });
  const good = makeObligation("a", 10n).o;

  test("accepts a good signature", async () => {
    expect(await validateObligation(good, await sign(good), ctx)).toBeNull();
  });
  test("rejects tampering", async () => {
    const sig = await sign(good);
    expect(await validateObligation({ ...good, recipient: testAccount.address }, sig, ctx)).toBe("bad_signature");
    expect(await validateObligation(good, "0x1234", ctx)).toBe("bad_signature");
  });
  test("rejects bad fields", async () => {
    const s = await sign(good);
    expect(await validateObligation({ ...good, sellToken: CNGN }, s, ctx)).toBe("wrong_tokens");
    expect(await validateObligation({ ...good, buyAmount: 0n }, s, ctx)).toBe("zero_amount");
    expect(await validateObligation({ ...good, recipient: zeroAddress }, s, ctx)).toBe("zero_recipient");
    expect(await validateObligation({ ...good, expiry: good.validAfter }, s, ctx)).toBe("bad_window");
    expect(await validateObligation({ ...good, validAfter: 0n, expiry: BigInt(T0) }, s, ctx)).toBe("expired");
    expect(await validateObligation({ ...good, maxSellAmount: 25_000_001n }, s, ctx)).toBe("over_cap");
  });
  test("hash is stable for the same data", () => {
    const h = () => hashTypedData({ domain: domain(settlement, 31337), types: obligationTypes, primaryType: "Obligation", message: good });
    expect(h()).toBe(h());
  });
});
