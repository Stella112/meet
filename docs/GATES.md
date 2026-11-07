# Gate ledger

Nothing here runs until Maris says "continue" for that row.

| # | Step | Who | How | Status |
|---|---|---|---|---|
| 1 | Confirm GitHub account, create private repo | assisted | `gh repo create --private` | done: Stella112/meet |
| 2 | Make repo public | Maris only | before row 3 | done |
| 3 | Register on Loops House (issues tag) | Maris only | event page | pending |
| 4 | Create and fund taker/solver wallet | Maris only | USDT, plus gas | pending |
| 5 | Create and fund maker wallet | Maris only | only if maker access is granted | pending |
| 6 | Fund buy wallet | assisted | `pnpm --filter agent exec buy setup --name buy` (@celo/buy 0.8.5), then send stablecoin | created 0x134ee545D978Ad5e7a5aF2f082fa336C4589A018 (key in OS keychain); funded $0.40 USD₮ on 2026-11-06 |
| 7 | Set `.env` | Maris only | copy `.env.example`; never paste keys in chat | done: local, and VPS live since 2026-11-07 (key entered by Maris on the server) |
| 8 | Street-rate entry each day | Maris only | usemeet.website/street with the owner token; older than 30 h shows "no data" | pending: first entry |
| 9 | Approve mainnet deploy | Maris only | after `forge test` output | done: 0x6667…0591 |
| 10 | Register ERC-8004 | agent-runnable | `register(agentURI)` from the agent wallet | done: agentId 10044, tx 0x33c7…0a17 |
| 11 | Textile maker access | Maris only | Stitch Connect or contact@textilecredit.com | pending |
| 12 | Textile API key (optional) | Maris only | Textile app | pending |
| 13 | x402 API key (P1) | Maris only | x402.celo.org | done 2026-11-07: on VPS; gate live at /x402/rates |
| 14 | First live payments | assisted | two Maris wallets, tiny amounts | done: 2 Uniswap, 1 Textile |
| 15 | Recruit eligible users | Maris only | check each wallet first: `node scripts/eligibility.mjs <addr>` | pending |
| 16 | Optional top-up | assisted | dry-run first, eligible wallets only | pending |
| 17 | Add agent wallet to entry and submit | Maris only | from `docs/SUBMISSION.md` | pending |
