import { runBatch } from "./engine.js";
import { DAY, HOUR, makeDeps, makeObligation, RATE, T0 } from "./fixtures.js";

// DEMO FIXTURES: made-up rates, nothing signed, nothing broadcast.
console.log("=== Meet dry-run: DEMO FIXTURES, not live data ===\n");

const { d, w, exec } = makeDeps();
d.store.setStreet({ usdt: 1_000_000n, cngn: 1375_000_000n, source: "demo manual", at: T0 });

const due = T0 + 3 * DAY;
for (const o of [
  makeObligation("payroll-ada", 10n, { expiry: BigInt(due) }, "Payroll: Ada"),
  makeObligation("payroll-emeka", 15n, { expiry: BigInt(due) }, "Payroll: Emeka"),
  makeObligation("rent", 20n, { expiry: BigInt(due + DAY) }, "Bills: rent"),
  makeObligation("too-big", 40n, { expiry: BigInt(due) }, "Over the $25 cap"),
]) {
  d.store.add(o);
}

const step = async (title: string, at: number, change: () => void = () => {}) => {
  w.now = at;
  change();
  await runBatch(d, at);
  console.log(`-- ${title}`);
  for (const o of ["payroll-ada", "payroll-emeka", "rent", "too-big"]) {
    console.log(`   ${o.padEnd(14)} ${d.store.get(o)!.status}`);
  }
};

await step("window open, normal news, no edge: hold dollars", T0 + HOUR);
await step("buffer reached for payroll: Textile cheaper", due - 11 * HOUR);
await step("rent still waiting; Uniswap now cheaper at rent's buffer", due + DAY - 11 * HOUR, () => {
  w.textile = RATE - 2n;
  w.uniswap = RATE;
});
await step("too-big expires unpaid", due + 2 * DAY);

console.log("\nWould-have-happened actions:");
for (const a of exec.actions) console.log("  " + a);

console.log("\nLedger:");
for (const r of d.store.ledger()) {
  console.log(`  ${r.label}: ${r.venue} rule=${r.rule} paid=${r.paidUsdt} delivered=${r.deliveredCngn}`);
  console.log(`    vs street: ${r.vsStreet}`);
  console.log(`    vs day 1:  ${r.vsDay1}`);
}

const expected: Record<string, string> = { "payroll-ada": "paid", "payroll-emeka": "paid", rent: "paid", "too-big": "expired" };
const wrong = Object.entries(expected).filter(([id, s]) => d.store.get(id)!.status !== s);
const venues = d.store.ledger().map((r) => r.venue).join(",");
if (wrong.length || venues !== "textile,textile,uniswap") {
  console.error("FAIL", wrong, venues);
  process.exit(1);
}
console.log("\nPASS: fixture batch produced the expected outcomes");
