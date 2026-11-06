import { describe, expect, test } from "vitest";
import { buildDashboard, parseSaving } from "../src/dashboard.js";
import { runBatch } from "../src/engine.js";
import { DAY, HOUR, makeDeps, makeObligation, T0, testAccount } from "../src/fixtures.js";

describe("parseSaving", () => {
  test("reads older receipt strings", () => {
    expect(parseSaving("₦36.23 better (demo manual, 2027-01-17T21:00:00.000Z)")).toBe(36_230_000n);
    expect(parseSaving("₦1,013.82 worse (Textile quote, x)")).toBe(-1_013_820_000n);
    expect(parseSaving("no data")).toBeNull();
  });
});

describe("buildDashboard", () => {
  const due = T0 + 3 * DAY;
  test("empty ledger", () => {
    const { d } = makeDeps();
    const v = buildDashboard(d.store, T0, { live: false, streetMaxAgeHours: 30 });
    expect(v.payments.paid).toBe(0);
    expect(v.payments.nairaPerUsd).toBeNull();
    expect(v.savings.vsDay1).toEqual({ totalCngn: 0n, counted: 0, missing: 0 });
    expect(v.street).toBeNull();
  });

  test("zero-price placeholder calls are not paid services", () => {
    const { d } = makeDeps();
    d.store.recordPaidCall("2026-11-05", "news", 0n, null, true);
    expect(buildDashboard(d.store, T0, { live: true, streetMaxAgeHours: 30 }).services.calls).toBe(0);
  });

  test("totals, savings, service spend, and no names or owners", async () => {
    const { d } = makeDeps();
    d.store.add(makeObligation("a", 10n, {}, "Payroll: Ada Secret"));
    d.store.add(makeObligation("b", 15n, {}, "Payroll: Emeka Secret"));
    d.store.setStreet({ usdt: 1_000_000n, cngn: 1_375_000_000n, source: "manual: BDC", at: due - 12 * HOUR });
    await runBatch(d, due - 11 * HOUR);
    const engineCalls = d.store.paidCalls().filter((c) => c.atomic > 0n);
    d.store.recordPaidCall("2027-01-01", "news", 5_000n, "0xabc", true);
    d.store.recordPaidCall("2027-01-01", "news", 5_000n, null, false);

    const v = buildDashboard(d.store, due, { live: false, streetMaxAgeHours: 30 });
    const ledger = d.store.ledger();
    expect(v.payments.paid).toBe(2);
    expect(v.payments.byStatus.paid).toBe(2);
    expect(v.payments.deliveredCngn).toBe(ledger[0].deliveredCngn + ledger[1].deliveredCngn);
    expect(v.payments.paidUsdt).toBe(ledger[0].paidUsdt + ledger[1].paidUsdt);
    expect(v.savings.vsDay1.counted).toBe(2);
    expect(v.savings.vsDay1.totalCngn).toBe(ledger[0].savedDay1Cngn! + ledger[1].savedDay1Cngn!);
    expect(v.savings.vsStreet.counted).toBe(2);
    expect(v.services.calls).toBe(engineCalls.length + 2);
    expect(v.services.failed).toBe(engineCalls.filter((c) => !c.ok).length + 1);
    expect(v.services.spentUsdt).toBe(engineCalls.reduce((s, c) => s + c.atomic, 0n) + 10_000n);
    expect(v.street?.fresh).toBe(true);

    const text = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    expect(text).not.toContain("Secret");
    expect(text.toLowerCase()).not.toContain(testAccount.address.toLowerCase().slice(2));
  });

  test("falls back to parsing rows that predate numeric savings", () => {
    const { d } = makeDeps();
    d.store.addLedger({
      obligationId: "old",
      label: "x",
      venue: "uniswap",
      rule: "buffer_reached",
      routeReason: "",
      paidUsdt: 471_000n,
      deliveredCngn: 650_000_000n,
      vsStreet: "no data",
      vsDay1: "₦0.42 worse (Uniswap quote, t)",
      buyTx: "0x1",
      settleTx: "0x2",
      at: 1,
    });
    const v = buildDashboard(d.store, 2, { live: true, streetMaxAgeHours: 30 });
    expect(v.savings.vsDay1).toEqual({ totalCngn: -420_000n, counted: 1, missing: 0 });
    expect(v.savings.vsStreet).toEqual({ totalCngn: 0n, counted: 0, missing: 1 });
    expect(v.recent[0].savedDay1Cngn).toBe(-420_000n);
  });
});
