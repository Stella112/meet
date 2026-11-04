import { verifyTypedData } from "viem";
import { z } from "zod";
import type { Address, Hex, Obligation } from "./types.js";

export const CHAIN_ID = 42220;
// On-chain reads recorded in docs/VERIFIED.md
export const USDT: Address = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
export const CNGN: Address = "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f";

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

export const domain = (verifyingContract: Address, chainId = CHAIN_ID) =>
  ({ name: "MeetSettlement", version: "1", chainId, verifyingContract }) as const;

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((a) => a as Address);
const uint = z.string().regex(/^\d+$/).transform((v) => BigInt(v));

export const obligationSchema = z.object({
  owner: address,
  recipient: address,
  sellToken: address,
  buyToken: address,
  buyAmount: uint,
  maxSellAmount: uint,
  validAfter: uint,
  expiry: uint,
  nonce: uint,
});

export type Rejection =
  | "wrong_tokens"
  | "zero_amount"
  | "bad_window"
  | "expired"
  | "over_cap"
  | "zero_recipient"
  | "bad_signature";

/** Everything the contract would check that can be checked before accepting the intent. */
export async function validateObligation(
  o: Obligation,
  sig: Hex,
  ctx: { settlement: Address; chainId?: number; now: number; maxUsd: bigint },
): Promise<Rejection | null> {
  if (o.sellToken.toLowerCase() !== USDT.toLowerCase() || o.buyToken.toLowerCase() !== CNGN.toLowerCase()) {
    return "wrong_tokens";
  }
  if (o.buyAmount === 0n || o.maxSellAmount === 0n) return "zero_amount";
  if (/^0x0{40}$/.test(o.recipient)) return "zero_recipient";
  if (o.expiry <= o.validAfter) return "bad_window";
  if (o.expiry <= BigInt(ctx.now)) return "expired";
  if (o.maxSellAmount > ctx.maxUsd) return "over_cap";
  const ok = await verifyTypedData({
    address: o.owner,
    domain: domain(ctx.settlement, ctx.chainId),
    types: obligationTypes,
    primaryType: "Obligation",
    message: o,
    signature: sig,
  }).catch(() => false);
  return ok ? null : "bad_signature";
}
