import { BaseError, ContractFunctionRevertedError, createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { runBatch } from "./engine.js";
import { CNGN, domain, obligationTypes, USDT } from "./eip712.js";
import { DAY, HOUR, makeDeps, makeObligation, RATE, T0 } from "./fixtures.js";

// Failed-limit proof: every layer refuses a payment outside its limits, and no money moves.
//   A. the live API refuses an over-cap obligation (only refusals are sent, so nothing is saved);
//   B. the mainnet contract refuses bad settles, simulated with eth_call (no tx, no key);
//   C. the agent's guard refuses to buy when the rate or a cap is out of bounds (demo fixtures, offline).
// Usage: pnpm --filter agent failed-limit [--api https://usemeet.website]
const API = process.argv.includes("--api") ? process.argv[process.argv.indexOf("--api") + 1] : "https://usemeet.website";
const SETTLEMENT: Address = "0x666792B9eF14D6Ca9AAEee598784efcfD2840591";
const SOLVER: Address = "0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956"; // the only address allowed to call settle()
const PAYEE: Address = "0xdc646c197d0202fc2a0326af8ab55066a3549e2e";
const abi = parseAbi([
  "struct Obligation { address owner; address recipient; address sellToken; address buyToken; uint256 buyAmount; uint256 maxSellAmount; uint64 validAfter; uint64 expiry; uint256 nonce; }",
  "function settle(Obligation o, bytes sig, uint256 sellAmount, address supplier)",
  "error NotSolver()",
  "error NotYetValid()",
  "error Expired()",
  "error AboveMax()",
  "error BadSignature()",
  "error NonceCancelled()",
  "error NonceUsed()",
]);

let failures = 0;
const line = (ok: boolean, what: string, got: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "REFUSED as expected" : "UNEXPECTED        "}  ${what}: ${got}`);
};

// A throwaway owner, made fresh for this run: never funded, never approved anything.
const owner = privateKeyToAccount(generatePrivateKey());
const now = Math.floor(Date.now() / 1000);
async function signed(over: Partial<{ buyAmount: bigint; maxSellAmount: bigint; validAfter: bigint; expiry: bigint }>) {
  const message = {
    owner: owner.address,
    recipient: PAYEE,
    sellToken: USDT,
    buyToken: CNGN,
    buyAmount: 1_400_000_000n,
    maxSellAmount: 1_050_000n,
    validAfter: BigInt(now - 60),
    expiry: BigInt(now + 6 * 3600),
    nonce: BigInt(now) * 1000n + BigInt(Math.floor(Math.random() * 1000)),
    ...over,
  };
  const sig = await owner.signTypedData({ domain: domain(SETTLEMENT), types: obligationTypes, primaryType: "Obligation", message });
  return { message, sig };
}

console.log(`Failed-limit proof · ${new Date().toISOString()} · throwaway owner ${owner.address} (unfunded)\n`);

// A. Live API
console.log(`A. Agent API at ${API}`);
const cfg = (await (await fetch(`${API}/api/config`)).json()) as { maxObligationUsdt: string; live: boolean };
const cap = BigInt(cfg.maxObligationUsdt);
for (const [what, over] of [
  [`worst case $${Number(cap + 1n) / 1e6}, one millionth of a dollar over the $${Number(cap) / 1e6} cap`, { maxSellAmount: cap + 1n }],
  ["already expired", { validAfter: BigInt(now - 7200), expiry: BigInt(now - 3600) }],
] as const) {
  const { message, sig } = await signed(over);
  const body = JSON.stringify({ items: [{ label: "failed-limit proof", message, sig }] }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const res = await fetch(`${API}/api/obligations`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const j = (await res.json()) as { error?: string };
  line(res.status === 400, what, `HTTP ${res.status} ${j.error ?? JSON.stringify(j)}`);
}

// B. Mainnet contract, simulated
console.log(`\nB. MeetSettlement ${SETTLEMENT} on Celo mainnet (eth_call, nothing sent)`);
const client = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
async function simulate(what: string, expected: string, from: Address, o: Awaited<ReturnType<typeof signed>>, sellAmount: bigint) {
  try {
    await client.simulateContract({ account: from, address: SETTLEMENT, abi, functionName: "settle", args: [o.message, o.sig as Hex, sellAmount, SOLVER] });
    line(false, what, "call would succeed");
  } catch (e) {
    const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
    const name = revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? revert.reason ?? "revert") : String(e).slice(0, 80);
    line(name === expected, what, name);
  }
}
const ok = await signed({});
await simulate("agent asks for 1 unit more than the signed worst case", "AboveMax", SOLVER, ok, ok.message.maxSellAmount + 1n);
await simulate("someone other than the agent calls settle", "NotSolver", PAYEE, ok, ok.message.maxSellAmount);
const late = await signed({ validAfter: BigInt(now - 7200), expiry: BigInt(now - 60) });
await simulate("settle after the obligation expired", "Expired", SOLVER, late, late.message.maxSellAmount);
const early = await signed({ validAfter: BigInt(now + 3600), expiry: BigInt(now + 7200) });
await simulate("settle before the payment window opens", "NotYetValid", SOLVER, early, early.message.maxSellAmount);

// C. Agent guard, offline on demo fixtures
console.log("\nC. Agent guard (demo fixtures, offline)");
const due = T0 + 3 * DAY;
async function scenario(what: string, env: Record<string, string>, setup: (w: ReturnType<typeof makeDeps>["w"]) => void, usd = 10n) {
  const { d, w, exec } = makeDeps(env);
  d.store.add(makeObligation("p", usd));
  setup(w);
  await runBatch(d, due - 11 * HOUR);
  const events = d.store.events("p").map((e) => `${e.kind}: ${e.detail}`);
  const bought = exec.actions.some((a) => /buy/i.test(a));
  line(!bought && d.store.get("p")!.status !== "paid", what, events.at(-1) ?? "nothing bought, nothing logged (paused)");
}
await scenario("market rate worse than the user's worst rate", {}, (w) => {
  w.textile = RATE / 2n;
  w.uniswap = RATE / 2n;
});
await scenario("payment bigger than the agent's cNGN exposure cap", { MAX_AGENT_CNGN_EXPOSURE_USD: "5" }, () => {});
await scenario("kill switch on", { PAUSED: "true" }, () => {});

console.log(`\n${failures === 0 ? "All limits held." : `${failures} check(s) did not behave as expected.`} No transaction was sent and no funds moved.`);
process.exit(failures === 0 ? 0 : 1);
