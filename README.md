<!-- readme-schema: R5-agent-ai v1 + event-overlay -->
# Meet

A naira treasury agent for dollar-earning businesses and people. It keeps your money in dollars, buys the naira your staff and bills need before they're due, and pays on time with proof of what it saved.

Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.

**Status: in development. Contract deployed on Celo mainnet. Three real test payments made between wallets one person controls.**

## Demo

TBD-post-build:video-url

App: https://usemeet.website (agent live on Celo mainnet since 2026-11-07, capped at $1.10 per payment and $1.10 of cNGN exposure). Ledger: https://usemeet.website/dashboard

## What it does

1. **Tell it once.** Money in (USD₮) and naira obligations: who, how much, when.
2. **It holds dollars.** Funds stay in your own wallet as USD₮.
3. **It converts just in time.** Inside each obligation's window, the agent picks the moment and the venue, within your signed worst rate.
4. **It pays.** cNGN goes straight to the payee.
5. **It proves it.** Every payment logs its result against the street rate and against converting on day 1, each with a source and time.

Your dollars stay in your wallet until your payee is paid. Meet buys naira early with its own money and bears that risk.

## Quickstart

```bash
pnpm install
pnpm --filter agent test
pnpm --filter agent dry-run:fixtures
```

The dry-run uses demo fixtures with made-up rates. It signs and broadcasts nothing.

## Built at Agents on Open Rails (Celo)

Tracks: Textile FX and Build with buy. Only Celo mainnet counts for the event.

## How the agent works

Each batch, the agent loads open obligations, applies a deterministic decision rule (news shock, buffer time, or early edge against the day-1 baseline), compares Textile and Uniswap, checks its caps, buys cNGN with its own wallet, and calls `settle()`. That call takes the owner's USD₮ and delivers cNGN to the payee in one transaction, or reverts and moves nothing.

If settlement fails, the cNGN stays as Meet's inventory, is retried within the hold limit, then is sold back. The user is told "Not paid, no funds moved."

## Prompts & safety

- Code makes every money decision. News is one paid X search, classified by a fixed rule: `shock` only when two different accounts report a devaluation, a CBN FX halt, or a naira drop of 3% or more. There is no LLM step: the buy catalog's only model (Cencori `maximo-atlas-1.3`) was retired upstream on 2026-11-06.
- Paid news spends real money even in dry-run, so it has its own switch: `PAID_NEWS=true` plus a `BUY_ACCOUNT_NAME` set up on that machine.
- `DRY_RUN=true` is the default. A mainnet tx needs both `DRY_RUN=false` and the `LIVE_ACK` value.
- Enforced caps cover obligation size, daily paid-service spend, cNGN exposure, slippage, hold time and inventory loss.
- Paid calls are never retried automatically.
- `PAUSED=true` and the contract's `pause()` are the kill switch.

News query and rule: [`agent/src/news.ts`](agent/src/news.ts), tested against real posts in [`agent/test/news.test.ts`](agent/test/news.test.ts).

## Run it

Environment variables (see `.env.example`):

| Name | Purpose |
|---|---|
| `DRY_RUN`, `LIVE_ACK`, `PAUSED` | Safety gates and kill switch |
| `MAX_OBLIGATION_USD`, `MAX_DAILY_SERVICE_SPEND_USD`, `MAX_AGENT_CNGN_EXPOSURE_USD`, `MAX_HEDGE_SLIPPAGE_BPS`, `MAX_HOLD_MINUTES`, `MAX_INVENTORY_LOSS_BPS` | Hard caps |
| `MAKER_IMPROVE_BPS`, `MAKER_PRIVATE_KEY` | Maker pricing and wallet |
| `CONVERT_BUFFER_HOURS`, `EARLY_EDGE_BPS`, `NEWS_TTL_MIN`, `BATCH_SECONDS` | Agent timing |
| `STREET_TOKEN`, `STREET_MAX_AGE_HOURS` | Daily street-rate entry at `/street`, and how long an entry counts |
| `PROTOCOL_FEE_BPS`, `TREASURY_ADDRESS` | Protocol fee |
| `CELO_RPC_URL`, `AGENT_PRIVATE_KEY`, `MEET_SETTLEMENT_ADDRESS` | Chain access |
| `ATTRIBUTION_TAG`, `ERC8004_AGENT_ID` | Hackathon identity |
| `TEXTILE_API_KEY`, `X402_API_KEY`, `BUY_ACCOUNT_NAME`, `PAID_NEWS`, `STREET_RATE_SOURCE` | Services |

## Tech stack

Solidity, Foundry, OpenZeppelin; Node, TypeScript, viem, better-sqlite3, zod, pino, vitest. Web app: Next.js 16, React 19, wagmi, viem, Tailwind 4; served from a VPS behind Caddy (see `deploy/`).

## Hackathon entry data

- Attribution tag: `celo_8d6bd2780c7d`
- Agent wallet: [`0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956`](https://celoscan.io/address/0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956)
- Buy wallet (pays Build with buy services): [`0x134ee545D978Ad5e7a5aF2f082fa336C4589A018`](https://celoscan.io/address/0x134ee545D978Ad5e7a5aF2f082fa336C4589A018)
- ERC-8004 agentId: [`10044`](https://celoscan.io/tx/0x33c720a99de8c9b793748e7b3497383a4f638efa2c5cadefe99b5901b5a20a17) in the Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`; agent card at https://usemeet.website/.well-known/agent-registration.json
- MeetSettlement: [`0x666792B9eF14D6Ca9AAEee598784efcfD2840591`](https://celoscan.io/address/0x666792B9eF14D6Ca9AAEee598784efcfD2840591)

## Services used (Build with buy) and proof of payment

Paid from the buy wallet `0x134e…A018` in USD₮ on Celo mainnet, through the buy gateway:

| Service | What it does in Meet | Price | Payment tx | Result |
|---|---|---|---|---|
| `x.posts.search` | News sense: last 24 h of naira/CBN posts | $0.005 | [`0xabc1…6bc`](https://celoscan.io/tx/0xabc1479292edf6b2f3445f2ba864d00f24464b80cd5fc5879f90711e832986bc) | 200, 16 posts |
| `x.posts.search` | Same, through the agent's `xNewsSense` | $0.005 | [`0xd92b…93a`](https://celoscan.io/tx/0xd92b50c77f0a5ed1232d3524f5b5a8dc98c8aacc3b1381477243d6dbbf3b293a) | 200, classified `normal` |
| `cencori.v1.chat.completions` | Tried for news classification | $0.01 | [`0xce8b…806`](https://celoscan.io/tx/0xce8b943c6e6ccad542c4d45c0b8d06307a78d6d0089f6035f01f6b42e78b7806) | Paid, then 400: model retired upstream. Not used. |
| `reddit.posts.search` | News cross-check: a shock must also be reported on Reddit when both platforms answer | $0.005 | [`0x4f61…694`](https://celoscan.io/tx/0x4f613704a6c8ec0c9c65660daaf7852729d91354eb67ffbe8e69d9a8c0496694) | 200, posts parsed |

## What is verified

- Contract tests pass locally: `forge test` (unit) and a Celo mainnet fork test using the real USD₮ and cNGN. The fork test is local and sends no real transactions.
- A viem signature is accepted by the contract in tests.
- Agent logic tests and the demo-fixture dry-run pass.

- MeetSettlement deployed on Celo mainnet, with the attribution tag confirmed by `verifyTx` on the deploy tx: [`0x96d876e028f8c341d8754eade0b8095435af7b8afdf03024942f5664c8c2d100`](https://celoscan.io/tx/0x96d876e028f8c341d8754eade0b8095435af7b8afdf03024942f5664c8c2d100).

- Two real ₦650 test payments on Celo mainnet via the Uniswap fallback, owner and payee both controlled by the builder (not independent users):
  - buy [`0xa27e…b6d`](https://celoscan.io/tx/0xa27e0bb4f87282c05d66475addcbe0beeacda08d188ee71b03b3adb827ae5b6d), settle [`0xd838…5fb`](https://celoscan.io/tx/0xd8385447e6ff75680ab8df369f6b904cbc84cfd394c3268474aea32fda9595fb)
  - buy [`0x4777…34a`](https://celoscan.io/tx/0x477749ba33d29e49a7a2419d56b94004fe01895c4ea582623e6036b81a95034a), settle [`0x2048…5aa`](https://celoscan.io/tx/0x2048d1d5bcc0a39f18900abeaa390f63e1ab4227a66b67c920598dcb44e735aa)
- The attribution tag is confirmed by `verifyTx` on each of those transactions. `pnpm --filter agent check-tags` lists every tx the agent wallet has sent (from Blockscout) and checks each one; on 2026-11-06 all 14 were tagged.

- One real ₦1,400 test payment via Textile (same builder-controlled wallets): buy [`0xcd04…7ae`](https://celoscan.io/tx/0xcd0484f327d5e2858145455011a8f4423f32daefa943dc960ce0eeb86ebdb7ae), settle [`0x60b2…0ce`](https://celoscan.io/tx/0x60b2ca395edde9fe2e967803f3d451d1d9a7bd7a696a7b2015177fa3e23240ce). Textile's minimum quote on this corridor is ₦1,377.406.

## Roadmap

Freelancer runway, school fees and family split presets. Silent netting. A paid x402 rate feed.

## License

MIT
