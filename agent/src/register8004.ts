import { toDataSuffix, verifyTx } from "@celo/attribution-tags";
import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { isLive, loadConfig } from "./config.js";
import type { Hex } from "./types.js";

// Registers the agent wallet in the ERC-8004 Identity Registry with one tagged tx.
// Simulates only unless DRY_RUN=false and LIVE_ACK are set. Never retries, and refuses if the wallet already holds an agent NFT.
// Usage: node --env-file=../.env --import tsx src/register8004.ts [agentURI]
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const; // name() "AgentIdentity", getVersion() "2.0.0" on Celo
const abi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const cfg = loadConfig();
const tag = process.env.ATTRIBUTION_TAG;
if (!tag) throw new Error("ATTRIBUTION_TAG is required");
const agentURI = process.argv[2] ?? "https://usemeet.website/.well-known/agent-registration.json";

const card = await fetch(agentURI).then((r) => {
  if (!r.ok) throw new Error(`agent card ${agentURI} returned ${r.status}`);
  return r.json() as Promise<{ type?: string; name?: string }>;
});
if (!card.type?.includes("eip-8004") || !card.name) throw new Error("agent card is missing type or name");

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
const transport = http(cfg.CELO_RPC_URL);
const client = createPublicClient({ chain: celo, transport });
const held = await client.readContract({ address: IDENTITY_REGISTRY, abi, functionName: "balanceOf", args: [account.address] });
if (held > 0n) throw new Error(`${account.address} already holds ${held} agent NFT(s); not registering twice`);

const dataSuffix = toDataSuffix(tag);
const { request, result } = await client.simulateContract({ account, address: IDENTITY_REGISTRY, abi, functionName: "register", args: [agentURI], dataSuffix });
console.log(`from ${account.address}\ncard ${agentURI} (${card.name})\nsimulation ok, next agentId would be ${result}`);

if (!isLive(cfg)) {
  console.log("DRY RUN: not sent");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: celo, transport });
const hash = await wallet.writeContract(request);
console.log(`sent ${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash });
const minted = parseEventLogs({ abi, logs: receipt.logs, eventName: "Transfer" }).find((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase());
console.log(`status ${receipt.status} agentId ${minted?.args.tokenId ?? "unknown"} gasUsed ${receipt.gasUsed}`);
console.log("tag on-chain", await verifyTx({ client, hash }));
