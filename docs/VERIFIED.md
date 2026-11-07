# Verified facts: 2026-11-03

Block at read time: 81839941 (Celo, chainId 42220).
GREEN = confirmed. RED = failed. FLAG = differs or needs a decision. DEFERRED = not checked yet.

## On-chain (`cast`, forno)

| Fact | Result | Status |
|---|---|---|
| cNGN `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` | decimals 6, symbol cNGN; EIP-1967 proxy; `paused()` = false | GREEN |
| USDT `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | decimals 6, symbol USD₮; EIP-1967 proxy | GREEN |
| USDC, USAT | decimals 6, 6 | GREEN |
| Permit2, Textile reactor, VaultOrderExecutor, SwapRouter02, QuoterV2 | code present | GREEN |
| ERC-8004 registry | code present (262 hex chars, small proxy) | GREEN |
| Pool `0x6519d56Eb0A69FC0338657784c783B169b8f7d32` | token0 USDT, token1 cNGN, fee 100; holds about ₦131.8M and $84.8k | GREEN |
| QuoterV2 | returns quotes at fee 100 | GREEN |
| cNGN and USDT plain transfer | `eth_call` from the pool to a fresh address returned true | GREEN (`transferFrom` through a contract is tested in the Phase 1 fork test) |
| cNGN source and restrictions | not on Sourcify; Etherscan V2 needs a key | UNKNOWN: pause exists; blacklist logic not read |

## Hackathon page

| Fact | Status |
|---|---|
| Deadline "Mon 9 Nov, 09:00 GMT"; winners Fri 13 Nov | GREEN |
| Celo mainnet only; tag on every tx with no backfill; ERC-8004 for every track; public repo | GREEN |
| Independent wallet definition | GREEN, matches revised brief |
| Build with buy needs no attribution tag | GREEN; tag kept for the Textile track |
| AskBots pre-check; 20 free x402 settlements | DEFERRED: not in the fetched summaries |
| Office hours link; Chainstack QR link | DEFERRED |

## Textile

| Fact | Status |
|---|---|
| Address book matches 9.2 (cNGN, USDT, reactor, executor, router, quoter, Permit2); 1 bps taker fee | GREEN |
| preview, request, submit shape; 75 s timeout; swap-only broadcast; no partials | GREEN |
| Max 4 outstanding RFQs | GREEN, detail: a firm quote holds its slot until fill or deadline, cancel does not release it, and it reserves taker balance |
| Corridor live | GREEN: previews at $1, $2, $25, $100 |
| Stitch feed `{price, timestamp, degraded?}`; offsets in `stitch.toml`; Windows supported | GREEN |
| "Stitch only accepts plain-http on localhost" | FLAG: not stated in the README; ADVANCED.md shows an https example. Test before relying on either |

## buy catalog (170 capabilities, 163 available)

| Service | Result | Status |
|---|---|---|
| **Wallet / sanctions screening** | **no capability matches** sanction, ofac, aml, kyt, screening, compliance, blacklist, wallet risk | **RED: required service not found** |
| Paid Celo RPC `chainstack.celo` | $0.01 per call, batch up to 2000 | GREEN |
| LLM `cencori.v1.chat.completions` | $0.01; model `maximo-atlas-1.3`, labelled closed beta | GREEN, beta flag |
| X search `x.posts.search` | $0.005 | GREEN |
| Gateway accepts USDC, USDT, USAT; x402 v1 and v2 | | GREEN |

## Other

| Fact | Status |
|---|---|
| x402 `/supported` lists USDC, USDT, USAT, cNGN (Permit2) | GREEN: cNGN confirmed |
| `@celo/buy` | Pinned 0.8.5 in `agent` on 2026-11-06 (its README now uses 0.8.5) |
| npm: attribution-tags 0.5.0; @x402/* 2.29.0; viem 2.57.16; better-sqlite3 13.0.3 | GREEN (exist) |
| Attribution API: `toDataSuffix`, `verifyTx`; viem `concat`; wagmi `dataSuffix` (docs.celo.org) | GREEN; package repo README not yet read |
| ERC-8004 `register(string)`, `Registered` event | GREEN. The docs do not mandate an agent card path |
| MiniPay detection `window.ethereum.isMiniPay` | GREEN |
| MiniPay holds USDm, USDC, USDT | FLAG: cNGN not listed, EIP-712 not mentioned. UNKNOWN until a phone test |
| Noblocks ramp | FLAG: the blog's link settles on **BNB Chain (chainId=56)**, not Celo |
| Section 9.3 BSC facts | DEFERRED: P2 only |

## Live prices (free previews, indicative)

| Direction | Textile | Uniswap |
|---|---|---|
| Sell $25 USDT | ₦1382.72/$ | ₦1382.67/$ |
| Sell ₦2,766 cNGN | ₦1383.11/$ | ₦1382.97/$ |

Implied Textile spread is about 3 bps. At these sizes the better hedge venue varies by direction.

# v3 re-verification: 2026-11-04

Earlier rows still stand unless changed here. Pricing and P2P decisions above were for the earlier product.

## Corridor check (`/rfq/preview`, 3 rounds, 18:38–18:39 UTC; identical each round)

| Size | Sell USDT, ₦/$ | Sell cNGN, ₦/$ | Exact-output cost in USDT |
|---|---|---|---|
| $2 | 1380.28 | 1380.24 | 2.0039 for ₦2,766 |
| $25 | 1380.27 | 1380.58 | 25.0494 for ₦34,575 |
| $100 | 1380.27 | 1380.62 | 100.1974 for ₦138,300 |

Reported depth: $79,597 selling USDT; ₦16,089,756 selling cNGN.

## Facts

| Fact | Status |
|---|---|
| Exact-output `buyAmount` on Celo | GREEN for preview; firm RFQ untested until the first tiny trade |
| Restricted liquidity can exclude Meet's maker wallet | RED: `restrictedLiquidityWallets` is an allowlist ("Restricted never leaves your list"). Brief's fallback applies: feed `degraded` before every take, logged |
| Who sells cNGN to a maker bid | UNKNOWN: depth shows maker inventory, not taker flow |
| Track text names treasury agents; judged on "volume quoted and filled" | GREEN; maker vs taker counting UNKNOWN (office hours) |
| Celo taker fee 1 bps | GREEN; maker fee UNKNOWN |
| Minimum swap size | UNKNOWN value; $2 previews work |
| News/search | `x.posts.search` $0.005, GREEN. `monid.reddit.tikhub.api-v1-reddit-app-fetch-news-feed` $0.005 also listed. No dedicated news service |
| LLM | `cencori.v1.chat.completions` $0.01, closed beta, GREEN |
| Screening | none in catalog |
| Street-rate service | none in catalog (search: fx, forex, exchange rate, currency, naira, ngn, parallel). Manual entry is the only allowed source |
| MiniPay wallet setup, finding address | UNKNOWN in docs; keep out of UI and README until checked |
| MiniPay shows cNGN | FLAG: docs say "Mini Apps should use USDT, USDC, and USDm only"; cNGN not listed |
| MiniPay EIP-712, approve | UNKNOWN in docs; phone test required |
| MiniPay gas | GREEN: paid in stablecoin; wallet can override `feeCurrency` |
| x402 assets | FLAG: `/supported` lists cNGN, event page does not. `/supported` wins per brief |
| x402 20 free settlements | GREEN |
| AskBots | FLAG: page says reviewer agents rate projects; no "pre-check" wording |
| Attribution repo | README read; SDK API detail in `sdk/README.md`, to read before Phase 4 |

# Live findings: 2026-11-05

| Fact | Evidence | Status |
|---|---|---|
| Textile firm RFQ minimum on Celo cNGN/USDT is ₦1,377.406 (`buyAmount` 1377406000) | `/rfq/request` returned 400 `invalid_request`: "buyAmount is below the RFQ minimum (1377406000 atomic units)", request `req_b467a803-aff5-446e-af27-5175d0e13471` | GREEN |
| Public RPC balance reads can lag a mined receipt | buy `0x4777…034a` succeeded with a cNGN Transfer in its logs while `balanceOf` read 0 | GREEN; agent now reads amounts from receipt logs |
| Every Meet tx carries `celo_8d6bd2780c7d` | `verifyTx` on deploy, approvals, both buys and both settles | GREEN |
| buy `x.posts.search` pays in USD₮ with `buy curl --token USDT`; the JSON reply carries `transaction` | 0xabc1479292edf6b2f3445f2ba864d00f24464b80cd5fc5879f90711e832986bc, 0xd92b50c77f0a5ed1232d3524f5b5a8dc98c8aacc3b1381477243d6dbbf3b293a: USD₮ Transfer 5000 from the buy wallet to the gateway | GREEN |
| Cencori via buy is unusable | Gateway only quotes `maximo-atlas-1.3` (other models get a free 400); Cencori answered "has been retired" after payment, 0xce8b943c6e6ccad542c4d45c0b8d06307a78d6d0089f6035f01f6b42e78b7806 (10000 atomic) | RED |
| `buy curl` exits 0 when the paid request ends 4xx; it warns on stderr with `paid: true`, `doNotRetry: true` | Cencori call above | GREEN; `agent/src/paid.ts` reads that warning |
| Opinion posts mention "devaluation" daily | Two of 16 posts on 2026-11-06; rule now needs event wording | GREEN |
| Independent user = not yours, not first funded by you or your main funder, own Celo activity before the hackathon started; new-to-Celo users don't disqualify you | loops.house/agents-on-open-rails FAQ, read 2026-11-06. No start date given; first timeline entry is Tue 6 Oct kick-off | GREEN; start date FLAG (checker defaults to 2026-10-06, `--since` overrides) |
| Your main funder: `0xd2557d5e918e57f31d38daba28a5f7df838b1b2d` first funded the treasury (59.7 CELO, 2026-11-05); 1 tx ever, so personal, not an exchange | Blockscout v2 | GREEN |
| Blockscout's Etherscan-style `/api` allows 10 requests then locks for ~56 min without a key; `/api/v2` still answers | 429 with `x-ratelimit-limit: 10` | GREEN; checker uses v2 + forno |
| forno serves historical state (nonce at a month-old block) | `eth_getTransactionCount` at block 79344042 | GREEN |
| Git Bash `grep` on this PC aborts (exit 134) when `-F` and `-i` are combined, printing nothing | `echo abc \| grep -c -F -i -- abc` aborted | GREEN; secrets check redone in Node |

| `reddit.posts.search` works through buy; envelope is `output.children[].post` with `authorInfo.name` and `content.markdown` | paid call `0x4f613704a6c8ec0c9c65660daaf7852729d91354eb67ffbe8e69d9a8c0496694` ($0.005), 2026-11-07 | GREEN |
| Catalog still lists only `maximo-atlas-1.3` for Cencori; no other LLM, news or screening service | live catalog, 2026-11-07 | FLAG |
| x402 rate feed live at usemeet.website/x402/rates ($0.001 USD₮/USDC to treasury), settled by api.x402.celo.org | buy-wallet purchase 0x4d22e96ab31a9ccd1def21fedd6f9ddee1594f41bac4370a71522de0d7bcd457 | GREEN |
