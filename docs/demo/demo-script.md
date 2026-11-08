# Meet demo script (2–3 minutes)

**The video must prove:** a real person schedules a naira payment from dollars, and the agent pays it on Celo mainnet within a signed limit, with a public record.

**Status:** draft, not recorded. Shots marked IF DONE need the step to have really happened. Skip any that didn't. Never stage or imply one.

## Time budget

| Part | Seconds | Judging point |
|---|---|---|
| Problem | 15 | Problem solved |
| Set up a payment | 35 | Real use |
| Agent's decision and paid calls | 35 | Build with buy depth |
| Payment and receipt | 35 | Textile filled volume, real settlement |
| Safety proof | 20 | Originality, trust |
| Ledger and close | 25 | Evidence |

## Pre-flight

- [ ] usemeet.website and /dashboard load
- [ ] Owner wallet on Celo with at least $1.10 USD₮
- [ ] Solver float at least $1.05 USD₮, and some CELO
- [ ] Today's street rate entered at /street, so "vs street" isn't "no data"
- [ ] Payment of ₦1,400 or more, so Textile can quote
- [ ] No `.env`, private key, owner token or personal details on screen
- [ ] Close other wallets and unrelated tabs

## Shots

**1. Problem (0:00–0:15).** Landing page.
> "If you earn in dollars and pay life in naira, you probably convert on payday, then watch rent get more expensive. And you're still paying the street spread."

**2. Set up (0:15–0:50).** Open /app. Choose Payroll or Bills, enter payee and ₦1,400, pick a date. Show the worst-case amount. Approve, then sign.
> "I tell Meet who, how much and when. I approve only the worst-case amount and sign one limit per payment. My dollars stay in my wallet."

**3. The agent decides (0:50–1:25).** Calendar showing the next action and reason. Then /dashboard, paid service calls, open one transaction link on Celoscan.
> "Meet holds dollars until close to the due date. A paid news check through buy, on X and Reddit, can bring it forward if a naira shock is reported on both. Code decides, not a language model."

**4. Payment (1:25–2:00).** Receipt in the app. Open the buy transaction (Textile reactor) and the settle transaction on Celoscan. Show the payee's cNGN balance.
> "Meet compared Textile and Uniswap, bought with its own float, and one transaction took my dollars and paid my payee, or nothing would have moved."
> Read out the actual vs-day-1 and vs-street figures on screen, even if worse.

IF DONE: show the same payment in MiniPay on a phone, and the payee's balance there.
IF DONE: show a payment from a second, independent user.

**5. Safety (2:00–2:20).** Terminal or `docs/demo/failed-limit-2026-11-07.txt`.
> "Here we try to take one unit more than the signed limit. The API and the contract both refuse."

**6. Ledger and close (2:20–2:45).** /dashboard totals: naira delivered, venues, paid calls, and independent wallets only if there are some.
> "Meet: dollars until the day you need naira, then paid, with the receipts on-chain. usemeet.website."

Say on camera or in captions: "Hackathon prototype, capped at $1.10 per payment."
