import { isLive, loadConfig } from "./config.js";
import { runBatch, type Deps } from "./engine.js";
import { LiveExecutor, liveChain, liveQuotes } from "./live.js";
import { Store } from "./store.js";
import type { Address, Hex } from "./types.js";

// Usage: recoverBought <obligationId>=<buyTxHash> ...
// For obligations stuck in "buying" after an uncertain buy: rebuild the lot from the buy tx receipt
// (never from balances), then run one batch so the normal held-lot path settles or unwinds it.
const cfg = loadConfig();
if (!isLive(cfg)) throw new Error("live flags required");
const clock = () => Math.floor(Date.now() / 1000);
const settlement = process.env.MEET_SETTLEMENT_ADDRESS as Address;
const exec = new LiveExecutor(cfg, settlement, process.env.AGENT_PRIVATE_KEY as Hex, process.env.ATTRIBUTION_TAG!, clock, console.log);
const store = new Store(new URL("../data/ledger.sqlite", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("%20", " "));

const seen = new Set<string>();
for (const arg of process.argv.slice(2)) {
  const [id, hash] = arg.split("=");
  if (seen.has(hash)) throw new Error(`tx ${hash} used twice`);
  seen.add(hash);
  const o = store.get(id);
  if (!o || o.status !== "buying") throw new Error(`${id} is not in buying state`);
  const { cngnIn, usdtOut } = await exec.transfersIn(hash as Hex);
  if (cngnIn < o.o.buyAmount) throw new Error(`${hash} delivered ${cngnIn}, needs ${o.o.buyAmount}`);
  store.setLot(o, { cngn: o.o.buyAmount, usdtCost: usdtOut, venue: "uniswap", boughtAt: clock(), txHash: hash }, "bought");
  store.log(clock(), id, "recovered", `lot from receipt ${hash}: cngn=${cngnIn} usdt=${usdtOut}`);
}

const deps: Deps = {
  cfg,
  store,
  exec,
  chain: liveChain(cfg, settlement),
  quotes: liveQuotes(cfg, clock),
  senses: { newsPrice: 0n, news: async () => ({ value: "unknown", tx: null }) },
  notify: { tell: (x, m) => console.log(`TELL ${x.id}: ${m}`) },
};
await runBatch(deps, clock());
for (const r of store.ledger()) {
  console.log(`${r.label}: ${r.venue} paid ${r.paidUsdt} delivered ${r.deliveredCngn}\n  buy ${r.buyTx}\n  settle ${r.settleTx}\n  vs street: ${r.vsStreet}\n  vs day 1: ${r.vsDay1}`);
}
for (const e of store.events()) if (["settle_failed", "unwound", "unwind_failed"].includes(e.kind)) console.log(`${e.kind}: ${e.detail}`);
