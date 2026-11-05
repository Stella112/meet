import { toDataSuffix } from "@celo/attribution-tags";
import { createPublicClient, http, parseAbi } from "viem";
import { celo } from "viem/chains";

// On-chain reads recorded in docs/VERIFIED.md
export const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const;
export const CNGN = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f" as const;
export const TAG = toDataSuffix(process.env.NEXT_PUBLIC_ATTRIBUTION_TAG ?? "celo_8d6bd2780c7d");

export const publicClient = createPublicClient({ chain: celo, transport: http() });

export const erc20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);
export const settlementAbi = parseAbi(["function cancel(uint256 nonce)"]);

export const obligationTypes = {
  Obligation: [
    { name: "owner", type: "address" },
    { name: "recipient", type: "address" },
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "buyAmount", type: "uint256" },
    { name: "maxSellAmount", type: "uint256" },
    { name: "validAfter", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const usd = (atomic: bigint | string) => (Number(atomic) / 1e6).toFixed(4);
export const naira = (n: bigint | string | number) => `₦${Number(n).toLocaleString("en-NG")}`;
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const txLink = (h: string) => `https://celoscan.io/tx/${h}`;
