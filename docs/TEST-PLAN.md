# End-to-end test plan (live, Celo mainnet)

Run once, in this order, when the owner wallet has USD₮. Everything here is real money and real transactions.
About $1.10 USD₮ in the owner wallet covers all of it: the cancel test runs first, so only one payment is ever funded.

## Before you start

| Check | How | Expect |
|---|---|---|
| Agent is live | `curl -s https://usemeet.website/api/config` | `"live":true`, `"maxObligationUsdt":"1100000"` |
| Agent can buy | agent wallet `0x9155…A956` on Celoscan | ≥ $1.05 USD₮, some CELO for gas |
| Owner wallet funded | the wallet you pay from (treasury `0xD452…` or MiniPay) | ≥ $1.10 USD₮; CELO for gas unless MiniPay |
| Payee is not the owner | e.g. test payee `0xdc646c197d0202fc2a0326af8ab55066a3549e2e` | different address |

## 1. Street rate

1. Open https://usemeet.website/street, enter today's BDC buy rate, its source and the owner token (`ssh hbar-vps "grep STREET_TOKEN /opt/meet/.env"`).
2. Expect "Saved ₦… per $1". The home page shows "Street rate: ₦… per $1".

## 2. Connect and network

1. Open https://usemeet.website in the wallet's browser (desktop extension or MiniPay).
2. Connect. If the page says the wallet is on another network, press **Switch to Celo**.
3. Expect "Connected 0x…" and the payment form.

## 3. Cancel flow (no money moves)

1. Bills · name `Cancel test` · payee wallet · `1400` · due **tomorrow**.
2. Approve (exact amount) and sign. Expect the calendar to show it as pending, "Holding your dollars…".
3. Press **Cancel** and confirm in the wallet.
4. Expect status `cancelled` within about a minute (the agent reads `cancelled()` on-chain at its next batch). Owner USD₮ unchanged except gas. The approval stays; that is fine, the contract only pays signed obligations.
5. Record the approve and cancel tx hashes.

## 4. Payment through the website (the Execution proof)

1. Bills · name `Website test` · same payee · `1400` · due **today** (before 17:00 local, so the 12-hour buffer has already passed).
2. Check the summary says a worst case of about 1.05 USD₮ and no "prototype limit" warning.
3. Approve and sign.
4. Within 1–2 minutes expect: status **Paid**, a receipt link, "vs street" and "vs converting on day 1" lines.
5. On the server: `ssh hbar-vps "journalctl -u meet-agent --since -10min -o cat"` shows the buy and settle txs.

## 5. Verify on-chain

| Check | Command | Expect |
|---|---|---|
| Payee got the naira | cNGN balance of the payee on Celoscan | +₦1,400 |
| Every agent tx tagged | `pnpm --filter agent check-tags` | 0 without `celo_8d6bd2780c7d` |
| Owner approve tagged | `cast receipt <approve-tx> --rpc-url https://forno.celo.org` and the tag check in `agent/src/checkTags.ts` style | `celo_8d6bd2780c7d` |
| Dashboard | https://usemeet.website/dashboard | 4 payments; the new one with both tx links |

## 6. MiniPay (if a phone is available)

Repeat step 4 inside MiniPay with a ₦1,400 payment. Record: does MiniPay show the EIP-712 message, does approve work, does the payee see cNGN (it is not in MiniPay's default token list). This closes plan risk 3.

## 7. Independent users

For each person who tries Meet: `node scripts/eligibility.mjs <their address>`. Only "eligible" wallets with "Meet payments funded ≥ 1" count.

## After the test

- Update README "What is verified" with the website payment's tx hashes.
- Fill `TBD-post-build:volume-note` in `docs/SUBMISSION.md`.
