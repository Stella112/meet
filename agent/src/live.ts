import { randomBytes } from "node:crypto";
import { withAttribution } from "@celo/attribution-tags";
import { createPublicClient, createWalletClient, decodeFunctionData, erc20Abi, http, parseAbi, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { isLive, type Config } from "./config.js";
import { CHAIN_ID, CNGN, USDT } from "./eip712.js";
import { MaybeBought, type Chain, type Executor, type Quotes } from "./engine.js";
import { uniswapMaxIn } from "./router.js";
import type { Address, Hex, Lot, StoredObligation, Venue, VenueQuote } from "./types.js";
import { textilePreviewBuy, uniswapQuoteBuy } from "./liveQuotes.js";

// https://docs.textilecredit.com/api/v2/rfq.html and /api/v2/authentication.html
const TEXTILE = "https://api.textilecredit.com/v2";
// https://docs.textilecredit.com/protocol/address-book.html
const ROUTER: Address = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const QUOTER: Address = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8";
const POOL_FEE = 100;

const routerAbi = parseAbi([
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) payable returns (uint256)",
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256, uint160, uint32, uint256)",
]);
const settlementAbi = parseAbi([
  "struct Obligation { address owner; address recipient; address sellToken; address buyToken; uint256 buyAmount; uint256 maxSellAmount; uint64 validAfter; uint64 expiry; uint256 nonce; }",
  "function settle(Obligation o, bytes sig, uint256 sellAmount, address supplier)",
  "function cancelled(address owner, uint256 nonce) view returns (bool)",
]);

export function publicClient(cfg: Config) {
  return createPublicClient({ chain: celo, transport: http(cfg.CELO_RPC_URL) });
}

export function liveQuotes(cfg: Config, now: () => number): Quotes {
  const client = publicClient(cfg);
  return {
    textileBuy: (c) => textilePreviewBuy(c, now()).catch(() => null),
    uniswapBuy: (c) => uniswapQuoteBuy(cfg.CELO_RPC_URL, c, now()).catch(() => null),
    sellBack: async (cngn) => {
      const { result } = await client.simulateContract({
        address: QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: CNGN, tokenOut: USDT, amountIn: cngn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }],
      });
      return { venue: "uniswap" as Venue, usdtOut: result[0] };
    },
  };
}

export function liveChain(cfg: Config, settlement: Address): Chain {
  const client = publicClient(cfg);
  return {
    ownerFunds: async (o: StoredObligation) => {
      const [balance, allowance] = await Promise.all([
        client.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [o.o.owner] }),
        client.readContract({ address: USDT, abi: erc20Abi, functionName: "allowance", args: [o.o.owner, settlement] }),
      ]);
      return { balance, allowance };
    },
    isCancelled: (o: StoredObligation) =>
      client.readContract({ address: settlement, abi: settlementAbi, functionName: "cancelled", args: [o.o.owner, o.o.nonce] }),
  };
}

export class LiveExecutor implements Executor {
  private client;
  private wallet;
  private account;

  constructor(
    private cfg: Config,
    private settlement: Address,
    privateKey: Hex,
    tag: string,
    private now: () => number,
    private onLog: (msg: string) => void = () => {},
  ) {
    if (!isLive(cfg)) throw new Error("LiveExecutor needs DRY_RUN=false and LIVE_ACK");
    if (cfg.PAUSED) throw new Error("PAUSED");
    this.account = privateKeyToAccount(privateKey);
    this.client = publicClient(cfg);
    this.wallet = createWalletClient({ account: this.account, chain: celo, transport: http(cfg.CELO_RPC_URL) }).extend(
      withAttribution(tag),
    );
  }

  private async confirm(hash: Hex, what: string): Promise<void> {
    this.onLog(`${what} tx ${hash}`);
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${what} reverted: ${hash}`);
  }

  /** Exact-amount approval. USDT-style tokens may need a reset to zero first. */
  private async ensureAllowance(token: Address, spender: Address, amount: bigint): Promise<void> {
    const current = await this.client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.account.address, spender],
    });
    if (current >= amount) return;
    if (current > 0n) {
      await this.confirm(await this.wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, 0n] }), "approve reset");
    }
    await this.confirm(await this.wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }), "approve");
  }

  private async firmRfq(cngn: bigint) {
    const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
    const issuedAt = Date.now();
    const signature = await this.account.signTypedData({
      domain: { name: "Textile Taker Control", version: "1", chainId: CHAIN_ID },
      types: {
        TakerControl: [
          { name: "taker", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "issuedAt", type: "uint256" },
        ],
      },
      primaryType: "TakerControl",
      message: { taker: this.account.address, chainId: BigInt(CHAIN_ID), nonce, issuedAt: BigInt(issuedAt) },
    });
    const res = await fetch(`${TEXTILE}/rfq/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(75_000),
      body: JSON.stringify({
        chainId: CHAIN_ID,
        sellToken: USDT,
        buyToken: CNGN,
        buyAmount: cngn.toString(),
        taker: this.account.address,
        takerProof: { nonce, issuedAt, signature },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`rfq ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.data;
  }

  private async buyTextile(quote: VenueQuote, cngn: bigint): Promise<{ hash: Hex }> {
    const data = await this.firmRfq(cngn);
    if (data.status !== "quoted") throw new Error(`textile ${data.status}: ${data.reason ?? ""}`);
    const q = data.quote;
    const takerPays = BigInt(q.takerPays);
    if (BigInt(q.buyAmount) < cngn) throw new Error("firm quote delivers too little");
    if (takerPays > uniswapMaxIn(quote.usdtIn, this.cfg.MAX_HEDGE_SLIPPAGE_BPS)) {
      throw new Error(`firm price ${takerPays} moved past preview ${quote.usdtIn}`);
    }
    // The approval target comes from the quote; only an exact approve of the sell token is accepted.
    const spender = (() => {
      const approval = data.transactions.approval;
      if (!approval) return q.reactor as Address;
      if (approval.to.toLowerCase() !== USDT.toLowerCase()) throw new Error("approval targets an unexpected token");
      const d = decodeFunctionData({ abi: erc20Abi, data: approval.data });
      if (d.functionName !== "approve") throw new Error("approval is not approve()");
      return d.args![0] as Address;
    })();
    await this.ensureAllowance(USDT, spender, takerPays);
    const expiresAt = typeof q.expiresAt === "number" ? q.expiresAt : Date.parse(q.expiresAt);
    if (Number.isFinite(expiresAt) && Date.now() >= (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt)) throw new Error("quote expired");
    const swap = data.transactions.swap;
    await this.client.call({ account: this.account, to: swap.to, data: swap.data });
    const hash = await this.wallet.sendTransaction({ to: swap.to, data: swap.data, value: 0n }).catch((e) => {
      throw new MaybeBought(`send: ${String(e)}`);
    });
    // Courtesy report; settlement is reconciled on-chain, so a failure here changes nothing.
    fetch(`${TEXTILE}/rfq/${data.rfqId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Rfq-Claim": data.claimToken },
      body: JSON.stringify({ txHash: hash }),
    }).catch(() => {});
    return { hash };
  }

  private async buyUniswap(quote: VenueQuote, cngn: bigint): Promise<{ hash: Hex }> {
    const maxIn = uniswapMaxIn(quote.usdtIn, this.cfg.MAX_HEDGE_SLIPPAGE_BPS);
    await this.ensureAllowance(USDT, ROUTER, maxIn);
    const params = {
      tokenIn: USDT,
      tokenOut: CNGN,
      fee: POOL_FEE,
      recipient: this.account.address,
      amountOut: cngn,
      amountInMaximum: maxIn,
      sqrtPriceLimitX96: 0n,
    };
    await this.client.simulateContract({ account: this.account, address: ROUTER, abi: routerAbi, functionName: "exactOutputSingle", args: [params] });
    const hash = await this.wallet.writeContract({ address: ROUTER, abi: routerAbi, functionName: "exactOutputSingle", args: [params] }).catch((e) => {
      throw new MaybeBought(`send: ${String(e)}`);
    });
    return { hash };
  }

  /** Amounts moved by a tx, read from its receipt logs. Balance reads can lag behind the receipt on public RPCs. */
  async transfersIn(hash: Hex): Promise<{ cngnIn: bigint; usdtOut: bigint }> {
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
    const me = this.account.address.toLowerCase();
    let cngnIn = 0n;
    let usdtOut = 0n;
    for (const log of parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })) {
      const token = log.address.toLowerCase();
      if (token === CNGN.toLowerCase() && log.args.to.toLowerCase() === me) cngnIn += log.args.value;
      if (token === USDT.toLowerCase() && log.args.from.toLowerCase() === me) usdtOut += log.args.value;
    }
    return { cngnIn, usdtOut };
  }

  async buy(quote: VenueQuote, cngn: bigint): Promise<Lot> {
    // Plain errors from the buy helpers mean the swap was never sent; MaybeBought means it may have been.
    const { hash } = quote.venue === "textile" ? await this.buyTextile(quote, cngn) : await this.buyUniswap(quote, cngn);
    this.onLog(`buy on ${quote.venue} tx ${hash}`);
    try {
      const { cngnIn, usdtOut } = await this.transfersIn(hash);
      if (cngnIn < cngn) throw new Error(`received ${cngnIn}, wanted ${cngn}`);
      return { cngn, usdtCost: usdtOut, venue: quote.venue, boughtAt: this.now(), txHash: hash };
    } catch (e) {
      throw new MaybeBought(`${hash}: ${String(e)}`);
    }
  }

  async settle(o: StoredObligation, sellAmount: bigint): Promise<string> {
    await this.ensureAllowance(CNGN, this.settlement, o.o.buyAmount);
    const args = [o.o, o.sig, sellAmount, this.account.address] as const;
    await this.client.simulateContract({ account: this.account, address: this.settlement, abi: settlementAbi, functionName: "settle", args });
    const hash = await this.wallet.writeContract({ address: this.settlement, abi: settlementAbi, functionName: "settle", args });
    await this.confirm(hash, "settle");
    return hash;
  }

  async unwind(lot: Lot, _venue: Venue): Promise<string> {
    const { result } = await this.client.simulateContract({
      address: QUOTER,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: CNGN, tokenOut: USDT, amountIn: lot.cngn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }],
    });
    await this.ensureAllowance(CNGN, ROUTER, lot.cngn);
    const hash = await this.wallet.writeContract({
      address: ROUTER,
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: CNGN,
        tokenOut: USDT,
        fee: POOL_FEE,
        recipient: this.account.address,
        amountIn: lot.cngn,
        amountOutMinimum: (result[0] * BigInt(10_000 - this.cfg.MAX_HEDGE_SLIPPAGE_BPS)) / 10_000n,
        sqrtPriceLimitX96: 0n,
      }],
    });
    await this.confirm(hash, "unwind");
    return hash;
  }
}
