#!/usr/bin/env node
// Independent-user check for the Agents on Open Rails hackathon, against Celo mainnet.
// Usage: node scripts/eligibility.mjs <address> [more addresses…] [--since 2026-10-06] [--json]
import { cfg, checkAddress, context } from "./eligibility-core.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sinceAt = args.indexOf("--since");
const since = sinceAt >= 0 ? args[sinceAt + 1] : cfg.hackathonStart;
const addresses = args.filter((x, i) => /^0x[0-9a-fA-F]{40}$/.test(x) && args[i - 1] !== "--since");
if (!addresses.length || !Number.isFinite(new Date(since).getTime())) {
  console.error("usage: node scripts/eligibility.mjs <0x address> [...] [--since 2026-10-06] [--json]");
  process.exit(2);
}

const ctx = await context(since);
const results = [];
for (const a of addresses) results.push(await checkAddress(a, ctx));

if (asJson) {
  console.log(JSON.stringify({ since, startBlock: ctx.startBlock, mainFunders: Object.fromEntries(ctx.mainFunders), notes: ctx.notes, results }, null, 2));
} else {
  console.log(`Rule: ${cfg.rule}\nStart taken as ${ctx.startLabel}. ${sinceAt >= 0 ? "" : cfg.hackathonStartNote}`);
  for (const [a, l] of ctx.mainFunders) console.log(`Your ${l}: ${a}`);
  for (const n of ctx.notes) console.log(`Note: ${n}`);
  for (const r of results) {
    console.log(`\n${r.address}: ${r.verdict.toUpperCase()}`);
    for (const c of r.checks) console.log(`  ${c.ok === true ? "ok   " : c.ok === false ? "FAIL " : "check"} ${c.rule}: ${c.detail}`);
    console.log(`  Meet payments funded: ${r.meetPayments}${r.meetPayments ? "" : " (has not used Meet yet)"}`);
  }
}
process.exit(results.every((r) => r.verdict === "eligible") ? 0 : 1);
