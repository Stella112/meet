<!-- readme-schema: R5-agent-ai v1 + event-overlay -->
# Meet

A naira treasury agent for dollar-earning businesses and people. It keeps your money in dollars, buys the naira your staff and bills need before they're due, and pays on time with proof of what it saved.

Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.

**Status: in development. Contract deployed on Celo mainnet. No real payment has been made yet.**

## Demo

TBD-post-build:video-url

TBD-post-build:app-url

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

- The LLM only classifies news and writes receipt text. Code makes every money decision.
- `DRY_RUN=true` is the default. A mainnet tx needs both `DRY_RUN=false` and the `LIVE_ACK` value.
- Enforced caps cover obligation size, daily paid-service spend, cNGN exposure, slippage, hold time and inventory loss.
- Paid calls are never retried automatically.
- `PAUSED=true` and the contract's `pause()` are the kill switch.

TBD-post-build:prompts

## Run it

Environment variables (see `.env.example`):

| Name | Purpose |
|---|---|
| `DRY_RUN`, `LIVE_ACK`, `PAUSED` | Safety gates and kill switch |
| `MAX_OBLIGATION_USD`, `MAX_DAILY_SERVICE_SPEND_USD`, `MAX_AGENT_CNGN_EXPOSURE_USD`, `MAX_HEDGE_SLIPPAGE_BPS`, `MAX_HOLD_MINUTES`, `MAX_INVENTORY_LOSS_BPS` | Hard caps |
| `MAKER_IMPROVE_BPS`, `MAKER_PRIVATE_KEY` | Maker pricing and wallet |
| `CONVERT_BUFFER_HOURS`, `EARLY_EDGE_BPS`, `NEWS_TTL_MIN`, `BATCH_SECONDS` | Agent timing |
| `PROTOCOL_FEE_BPS`, `TREASURY_ADDRESS` | Protocol fee |
| `CELO_RPC_URL`, `AGENT_PRIVATE_KEY`, `MEET_SETTLEMENT_ADDRESS` | Chain access |
| `ATTRIBUTION_TAG`, `ERC8004_AGENT_ID` | Hackathon identity |
| `TEXTILE_API_KEY`, `X402_API_KEY`, `BUY_ACCOUNT_NAME`, `STREET_RATE_SOURCE` | Services |

## Tech stack

Solidity, Foundry, OpenZeppelin; Node, TypeScript, viem, better-sqlite3, zod, pino, vitest. Web app: TBD-post-build:web-stack-final.

## Hackathon entry data

- Attribution tag: `celo_8d6bd2780c7d`
- Agent wallet: [`0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956`](https://celoscan.io/address/0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956)
- ERC-8004 agentId: TBD-post-build:agent-id
- MeetSettlement: [`0x666792B9eF14D6Ca9AAEee598784efcfD2840591`](https://celoscan.io/address/0x666792B9eF14D6Ca9AAEee598784efcfD2840591)

## Services used (Build with buy) and proof of payment

TBD-post-build:buy-tx-hashes

## What is verified

- Contract tests pass locally: `forge test` (unit) and a Celo mainnet fork test using the real USD₮ and cNGN. The fork test is local and sends no real transactions.
- A viem signature is accepted by the contract in tests.
- Agent logic tests and the demo-fixture dry-run pass.

- MeetSettlement deployed on Celo mainnet, with the attribution tag confirmed by `verifyTx` on the deploy tx: [`0x96d876e028f8c341d8754eade0b8095435af7b8afdf03024942f5664c8c2d100`](https://celoscan.io/tx/0x96d876e028f8c341d8754eade0b8095435af7b8afdf03024942f5664c8c2d100).

No real payment has been made on mainnet yet.

## Roadmap

Freelancer runway, school fees and family split presets. Silent netting. A paid x402 rate feed.

## License

MIT
