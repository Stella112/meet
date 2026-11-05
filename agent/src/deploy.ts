import { readFileSync } from "node:fs";
import { codeFromRepo, toDataSuffix, verifyTx } from "@celo/attribution-tags";
import { concat, createPublicClient, createWalletClient, encodeAbiParameters, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { isLive, loadConfig } from "./config.js";
import { CNGN, USDT } from "./eip712.js";
import type { Address, Hex } from "./types.js";

// Sends one tagged deploy tx. Never retries: a failure here may still have landed on-chain.
const cfg = loadConfig();
const tag = process.env.ATTRIBUTION_TAG;
const treasury = process.env.TREASURY_ADDRESS as Address;
const owner = treasury;
if (!tag || !treasury) throw new Error("ATTRIBUTION_TAG and TREASURY_ADDRESS are required");

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
const transport = http(cfg.CELO_RPC_URL);
const client = createPublicClient({ chain: celo, transport });
const wallet = createWalletClient({ account, chain: celo, transport });

const artifact = JSON.parse(readFileSync(new URL("../../contracts/out/MeetSettlement.sol/MeetSettlement.json", import.meta.url), "utf8"));
const args = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint16" }],
  [USDT, CNGN, owner, account.address, treasury, cfg.PROTOCOL_FEE_BPS],
);
const data = concat([artifact.bytecode.object as Hex, args, toDataSuffix(tag)]);

console.log(`from ${account.address} owner ${owner} fee ${cfg.PROTOCOL_FEE_BPS} tag ${tag} (repo-derived would be ${codeFromRepo("Stella112/meet")})`);
console.log(`constructor args ${args}`);
const gas = await client.estimateGas({ account, data });
console.log(`simulation ok, gas ${gas}`);

if (!isLive(cfg)) {
  console.log("DRY RUN: not sent");
  process.exit(0);
}

const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
console.log(`sent ${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`status ${receipt.status} contract ${receipt.contractAddress} gasUsed ${receipt.gasUsed}`);
console.log("tag on-chain", await verifyTx({ client, hash }));
