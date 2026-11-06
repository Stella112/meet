#!/usr/bin/env node
// Independent-user check for the Agents on Open Rails hackathon, against Celo mainnet (Blockscout v2 + forno).
// Usage: node scripts/eligibility.mjs <address> [more addresses…] [--since 2026-10-06] [--json]
// It only reads public chain data. It cannot prove who owns a wallet: "not yours" checks your own list.
import { readFileSync } from "node:fs";
import { evaluate, firstFunding, lower } from "./eligibility-lib.mjs";

const cfg = JSON.parse(readFileSync(new URL("./builder-wallets.json", import.meta.url), "utf8"));
const BS = "https://celo.blockscout.com/api/v2";
const RPC = "https://forno.celo.org";
const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e";
const AGENT = "0x9155deb21b6d7e8377c3ba2fe9ea6f0f5cf0a956";
const SETTLE_SELECTOR = "0x63d56aa4"; // MeetSettlement.settle; plain transfers to the agent are not payments
const MAX_PAGES = 20; // 50 items each; longer histories are flagged for a hand check

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sinceAt = args.indexOf("--since");
const since = sinceAt >= 0 ? args[sinceAt + 1] : cfg.hackathonStart;
const cutoff = Math.floor(new Date(since).getTime() / 1000);
const addresses = args.filter((x, i) => /^0x[0-9a-fA-F]{40}$/.test(x) && args[i - 1] !== "--since");
if (!addresses.length || !Number.isFinite(cutoff)) {
  console.error("usage: node scripts/eligibility.mjs <0x address> [...] [--since 2026-10-06] [--json]");
  process.exit(2);
}

// Public APIs rate-limit bursts (429). These are reads, so waiting and retrying is safe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url, init) {
  for (let attempt = 0; ; attempt++) {
    await sleep(150);
    const res = await fetch(url, init);
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt === 5) throw new Error(`${new URL(url).host} ${res.status}`);
    await sleep(1000 * 2 ** attempt);
  }
}
const rpc = async (method, params) => (await fetchJson(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).result;

/** All pages of a Blockscout v2 list (newest first), up to MAX_PAGES. */
async function pages(path, query) {
  const items = [];
  let next = {};
  for (let i = 0; i < MAX_PAGES && next; i++) {
    const j = await fetchJson(`${BS}${path}?${new URLSearchParams({ ...query, ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])) })}`);
    items.push(...(j.items ?? []));
    next = j.next_page_params;
  }
  return { items, complete: !next };
}
const at = (iso) => Math.floor(new Date(iso).getTime() / 1000);

/** Incoming CELO and ERC-20 transfers, normalized for firstFunding. */
async function incoming(address) {
  const [txs, tokens] = await Promise.all([pages(`/addresses/${address}/transactions`, { filter: "to" }), pages(`/addresses/${address}/token-transfers`, { filter: "to", type: "ERC-20" })]);
  const rows = [
    ...txs.items.filter((t) => t.status === "ok").map((t) => ({ from: t.from?.hash, to: t.to?.hash, at: at(t.timestamp), value: t.value ?? "0", what: "CELO", hash: t.hash })),
    ...tokens.items.map((t) => ({ from: t.from?.hash, to: t.to?.hash, at: at(t.timestamp), value: t.total?.value ?? "0", what: t.token?.symbol ?? "token", hash: t.transaction_hash })),
  ];
  return { rows, complete: txs.complete && tokens.complete };
}

/** Last block at or before `ts` (binary search on timestamps). */
async function blockAt(ts) {
  let hi = Number(await rpc("eth_blockNumber", []));
  let lo = Math.max(0, hi - 40_000_000);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const b = await rpc("eth_getBlockByNumber", [`0x${mid.toString(16)}`, false]);
    if (Number(b.timestamp) <= ts) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Builder wallets, plus your main funders: whoever first funded a builder wallet from outside the set.
const builder = new Map(Object.entries(cfg.wallets).map(([a, label]) => [lower(a), label]));
const mainFunders = new Map();
const notes = [];
for (const [a, label] of builder) {
  const f = firstFunding(a, (await incoming(a)).rows);
  if (!f || builder.has(f.from) || mainFunders.has(f.from)) continue;
  const n = Number((await fetchJson(`${BS}/addresses/${f.from}/counters`)).transactions_count ?? 0);
  if (n >= cfg.sharedFunderMinTxs) notes.push(`${f.from} first funded your ${label} but has ${n} txs (exchange or shared); not treated as yours`);
  else mainFunders.set(f.from, `main funder (first funded your ${label})`);
}

const startBlock = await blockAt(cutoff);
const startLabel = `${since} (block ${startBlock})`;
const results = [];
for (const address of addresses) {
  const inc = await incoming(address);
  const r = evaluate({
    address,
    builder,
    mainFunders,
    funding: firstFunding(address, inc.rows),
    fundingComplete: inc.complete,
    nonceAtStart: Number(await rpc("eth_getTransactionCount", [address, `0x${startBlock.toString(16)}`])),
    startLabel,
    isContract: (await rpc("eth_getCode", [address, "latest"])) !== "0x",
  });
  // Uses Meet: USD₮ it sent to the agent wallet inside a settle().
  const sent = await pages(`/addresses/${address}/token-transfers`, { filter: "from", token: USDT });
  r.meetPayments = sent.items.filter((t) => lower(t.to?.hash) === AGENT && t.method === SETTLE_SELECTOR).length;
  results.push(r);
}

if (asJson) {
  console.log(JSON.stringify({ since, startBlock, mainFunders: Object.fromEntries(mainFunders), notes, results }, null, 2));
} else {
  console.log(`Rule: ${cfg.rule}\nStart taken as ${startLabel}. ${sinceAt >= 0 ? "" : cfg.hackathonStartNote}`);
  for (const [a, l] of mainFunders) console.log(`Your ${l}: ${a}`);
  for (const n of notes) console.log(`Note: ${n}`);
  for (const r of results) {
    console.log(`\n${r.address}: ${r.verdict.toUpperCase()}`);
    for (const c of r.checks) console.log(`  ${c.ok === true ? "ok   " : c.ok === false ? "FAIL " : "check"} ${c.rule}: ${c.detail}`);
    console.log(`  Meet payments funded: ${r.meetPayments}${r.meetPayments ? "" : " (has not used Meet yet)"}`);
  }
}
process.exit(results.every((r) => r.verdict === "eligible") ? 0 : 1);
