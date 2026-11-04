import { pathToFileURL } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";
import { celo } from "viem/chains";
import { loadConfig } from "./config.js";
import { CHAIN_ID, CNGN, USDT } from "./eip712.js";
import type { Address, VenueQuote } from "./types.js";

// https://docs.textilecredit.com/api/v2/rfq.html
const TEXTILE = "https://api.textilecredit.com/v2";
// https://docs.textilecredit.com/protocol/address-book.html ; fee tier read from the pool on-chain
const QUOTER: Address = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8";
const FEE = 100;

const quoterAbi = parseAbi([
  "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)",
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)",
]);

/** Free indicative preview. Firm quotes are a separate, later step. */
export async function textilePreviewBuy(cngn: bigint, now: number): Promise<VenueQuote | null> {
  const res = await fetch(`${TEXTILE}/rfq/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId: CHAIN_ID, sellToken: USDT, buyToken: CNGN, buyAmount: cngn.toString() }),
  });
  const data = (await res.json()).data;
  if (data?.status !== "preview" || !data.takerPays) return null;
  return { venue: "textile", usdtIn: BigInt(data.takerPays), at: now };
}

export async function uniswapQuoteBuy(rpc: string, cngn: bigint, now: number): Promise<VenueQuote | null> {
  const client = createPublicClient({ chain: celo, transport: http(rpc) });
  const { result } = await client.simulateContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactOutputSingle",
    args: [{ tokenIn: USDT, tokenOut: CNGN, amount: cngn, fee: FEE, sqrtPriceLimitX96: 0n }],
  });
  return { venue: "uniswap", usdtIn: result[0], at: now };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Read-only: a free preview and an eth_call. Nothing is signed.
  const cfg = loadConfig();
  const now = Math.floor(Date.now() / 1000);
  for (const naira of [2_766n, 34_575n]) {
    const cngn = naira * 1_000_000n;
    const [t, u] = await Promise.all([textilePreviewBuy(cngn, now), uniswapQuoteBuy(cfg.CELO_RPC_URL, cngn, now)]);
    console.log(`₦${naira}: textile ${t?.usdtIn ?? "no_quote"} | uniswap ${u?.usdtIn ?? "no_quote"} (atomic USDT) at ${new Date(now * 1000).toISOString()}`);
  }
}
