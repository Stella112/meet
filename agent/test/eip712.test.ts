import { expect, test } from "vitest";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Same typed data the web app will sign. Foundry checks this exact digest and signature
// against the contract in contracts/test/MeetSettlement.t.sol (test_viemSignatureMatches).
const types = {
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

// Public test-only key, never funded.
const account = privateKeyToAccount(`0x${"a11ce".padStart(64, "0")}`);
const typed = {
  domain: {
    name: "MeetSettlement",
    version: "1",
    chainId: 31337,
    verifyingContract: "0x00000000000000000000000000000000000ab370" as `0x${string}`,
  },
  types,
  primaryType: "Obligation" as const,
  message: {
    owner: account.address,
    recipient: "0x0000000000000000000000000000000000000b0b" as `0x${string}`,
    sellToken: "0x0000000000000000000000000000000000000a01" as `0x${string}`,
    buyToken: "0x0000000000000000000000000000000000000a02" as `0x${string}`,
    buyAmount: 138300000000n,
    maxSellAmount: 103000000n,
    validAfter: 1000n,
    expiry: 2000n,
    nonce: 7n,
  },
};

test("digest and signature are stable", async () => {
  const digest = hashTypedData(typed);
  const signature = await account.signTypedData(typed);
  expect(account.address).toBe("0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7");
  expect(digest).toBe("0x269460d5ad12798b2e09292ebe388ac6cc105f15f2034157c0ea1573875ff7e9");
  expect(signature).toBe(
    "0x90677fc0a96c36f846484fdd821b70b7fb0b345e11f706a7651368492a1793cb448846b94b89864000a67740001cc769c2ffca5acbc302d342e806a55b2c6aa71b",
  );
});
