import { readFileSync } from "node:fs";
import { isLive, loadConfig } from "./config.js";
import { obligationSchema } from "./eip712.js";
import { runBatch, type Deps, type Executor } from "./engine.js";
import { DryRunExecutor } from "./dryExecutor.js";
import { LiveExecutor, liveChain, liveQuotes } from "./live.js";
import { Store } from "./store.js";
import type { Address, Hex, StoredObligation } from "./types.js";

// Usage: payOnce <agent/data file> <textile|uniswap>
// Runs one batch for one signed test obligation, forcing the venue so both paths get real proof.
// Paid news is not wired yet (Phase 4), so it reads "unknown"; the short window triggers the buffer rule.
const [file, venue] = process.argv.slice(2);
if (!file || (venue !== "textile" && venue !== "uniswap")) throw new Error("usage: payOnce <file> <textile|uniswap>");

const cfg = loadConfig();
const clock = () => Math.floor(Date.now() / 1000);
const settlement = process.env.MEET_SETTLEMENT_ADDRESS as Address;
const body = JSON.parse(readFileSync(file, "utf8"));
const store = new Store(new URL("../data/ledger.sqlite", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("%20", " "));

if (store.get(body.id)) throw new Error(`${body.id} was already processed; never run twice`);
// runBatch acts on every open obligation in the store, so refuse if anything else is open.
const others = store.open().filter((x) => x.id !== body.id);
if (others.length) throw new Error(`other open obligations would also run: ${others.map((x) => `${x.id}(${x.status})`).join(", ")}`);
const o: StoredObligation = {
  id: body.id,
  label: body.id,
  o: obligationSchema.parse(body.message),
  sig: body.sig as Hex,
  day1: { usdt: BigInt(body.day1.usdt), cngn: BigInt(body.day1.cngn), source: body.day1.source, at: body.day1.at },
  status: "pending",
  takerAtDue: false,
  lot: null,
};
store.add(o);

const quotes = liveQuotes(cfg, clock);
const exec: Executor = isLive(cfg)
  ? new LiveExecutor(cfg, settlement, process.env.AGENT_PRIVATE_KEY as Hex, process.env.ATTRIBUTION_TAG!, clock, console.log)
  : new DryRunExecutor(clock);

const deps: Deps = {
  cfg,
  store,
  exec,
  chain: liveChain(cfg, settlement),
  quotes: {
    ...quotes,
    textileBuy: venue === "textile" ? quotes.textileBuy : async () => null,
    uniswapBuy: venue === "uniswap" ? quotes.uniswapBuy : async () => null,
  },
  senses: { newsPrice: 0n, news: async () => ({ value: "unknown", tx: null }) },
  notify: { tell: (x, m) => console.log(`TELL ${x.id}: ${m}`) },
};

console.log(isLive(cfg) ? "LIVE: real money" : "DRY RUN: nothing signed or sent");
await runBatch(deps, clock());
for (const e of store.events(o.id)) console.log(`${e.kind}: ${e.detail}`);
console.log("status", store.get(o.id)!.status);
if (exec instanceof DryRunExecutor) console.log(exec.actions.join("\n"));
for (const r of store.ledger().filter((x) => x.obligationId === o.id)) {
  console.log(`${r.venue} paid ${r.paidUsdt} delivered ${r.deliveredCngn} buy ${r.buyTx} settle ${r.settleTx}`);
  console.log(`vs street: ${r.vsStreet}\nvs day 1: ${r.vsDay1}`);
}
