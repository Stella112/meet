// Network side of the independent-user check (Blockscout v2 + forno). Used by the CLI and the agent's /api/eligibility.
// It only reads public chain data. It cannot prove who owns a wallet: "not yours" checks builder-wallets.json.
import { readFileSync } from "node:fs";
import { evaluate, firstFunding, lower } from "./eligibility-lib.mjs";

export const cfg = JSON.parse(readFileSync(new URL("./builder-wallets.json", import.meta.url), "utf8"));
const BS = "https://celo.blockscout.com/api/v2";
const RPC = "https://forno.celo.org";
const USDT = "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e";
const AGENT = "0x9155deb21b6d7e8377c3ba2fe9ea6f0f5cf0a956";
const SETTLE_SELECTOR = "0x63d56aa4"; // MeetSettlement.settle; plain transfers to the agent are not payments
const MAX_PAGES = 20; // 50 items each; longer histories are flagged for a hand check

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

/** Builder wallets plus main funders (first funders of builder wallets), and the start block. Cache the result. */
export async function context(since = cfg.hackathonStart) {
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
  const startBlock = await blockAt(Math.floor(new Date(since).getTime() / 1000));
  return { since, builder, mainFunders, notes, startBlock, startLabel: `${since} (block ${startBlock})` };
}

/** Checks one wallet against the rule, plus how many settle() payments it funded through Meet. */
export async function checkAddress(address, ctx) {
  const inc = await incoming(address);
  const r = evaluate({
    address,
    builder: ctx.builder,
    mainFunders: ctx.mainFunders,
    funding: firstFunding(address, inc.rows),
    fundingComplete: inc.complete,
    nonceAtStart: Number(await rpc("eth_getTransactionCount", [address, `0x${ctx.startBlock.toString(16)}`])),
    startLabel: ctx.startLabel,
    isContract: (await rpc("eth_getCode", [address, "latest"])) !== "0x",
  });
  const sent = await pages(`/addresses/${address}/token-transfers`, { filter: "from", token: USDT });
  r.meetPayments = sent.items.filter((t) => lower(t.to?.hash) === AGENT && t.method === SETTLE_SELECTOR).length;
  return r;
}
