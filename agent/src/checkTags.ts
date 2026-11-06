import { verifyTx } from "@celo/attribution-tags";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import type { Hex } from "./types.js";

// Checks that every tx the agent wallet has ever sent on Celo carries the attribution tag (the event allows no backfill).
// Lists txs from Blockscout, then decodes each tag from chain data with verifyTx. Exits 1 if any tx is untagged.
// Usage: pnpm --filter agent check-tags [address]
const TAG = process.env.ATTRIBUTION_TAG ?? "celo_8d6bd2780c7d";
const wallet = (process.argv[2] ?? process.env.AGENT_WALLET ?? "0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956").toLowerCase();
const client = createPublicClient({ chain: celo, transport: http(process.env.CELO_RPC_URL ?? "https://forno.celo.org") });

type Item = { hash: Hex; from: { hash: string }; method: string | null; timestamp: string };
const sent: Item[] = [];
let next: Record<string, unknown> | null = {};
while (next) {
  const qs = new URLSearchParams({ filter: "from", ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`https://celo.blockscout.com/api/v2/addresses/${wallet}/transactions?${qs}`);
  if (!res.ok) throw new Error(`Blockscout returned ${res.status}`);
  const page = (await res.json()) as { items: Item[]; next_page_params: Record<string, unknown> | null };
  sent.push(...page.items.filter((t) => t.from.hash.toLowerCase() === wallet));
  next = page.next_page_params;
}

let missing = 0;
for (const t of sent.reverse()) {
  const decoded = await verifyTx({ client, hash: t.hash });
  const ok = decoded?.codes.includes(TAG) ?? false;
  if (!ok) missing++;
  console.log(`${ok ? "TAGGED  " : "UNTAGGED"} ${t.timestamp.slice(0, 19)} ${(t.method ?? "deploy").padEnd(18)} ${t.hash}`);
}
console.log(`${sent.length} txs from ${wallet}, ${missing} without ${TAG}`);
process.exit(missing === 0 && sent.length > 0 ? 0 : 1);
