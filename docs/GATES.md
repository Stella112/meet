# Gate ledger

Nothing here runs until Maris says "continue" for that row.

| # | Step | Who | How | Status |
|---|---|---|---|---|
| 1 | Confirm GitHub account, create private repo | assisted | `gh repo create --private` | done: Stella112/meet |
| 2 | Make repo public | Maris only | before row 3 | done |
| 3 | Register on Loops House (issues tag) | Maris only | event page | pending |
| 4 | Create and fund taker/solver wallet | Maris only | USDT, plus gas | pending |
| 5 | Create and fund maker wallet | Maris only | only if maker access is granted | pending |
| 6 | Fund buy wallet | assisted | `npx --yes @celo/buy@<pinned> setup --name buy`, then send stablecoin | pending |
| 7 | Set `.env` | Maris only | copy `.env.example`; never paste keys in chat | pending |
| 8 | Street-rate entry each day | Maris only | manual, timestamped | pending |
| 9 | Approve mainnet deploy | Maris only | after `forge test` output | done: 0x6667…0591 |
| 10 | Register ERC-8004 | agent-runnable | `register(agentURI)` from the agent wallet | ready: card live, `pnpm --filter agent register:8004` simulates; send needs live flags |
| 11 | Textile maker access | Maris only | Stitch Connect or contact@textilecredit.com | pending |
| 12 | Textile API key (optional) | Maris only | Textile app | pending |
| 13 | x402 API key (P1) | Maris only | x402.celo.org | pending |
| 14 | First live payments | assisted | two Maris wallets, tiny amounts | done: 2 Uniswap, 1 Textile |
| 15 | Recruit eligible users | Maris only | eligibility checker first | pending |
| 16 | Optional top-up | assisted | dry-run first, eligible wallets only | pending |
| 17 | Add agent wallet to entry and submit | Maris only | from `docs/SUBMISSION.md` | pending |
