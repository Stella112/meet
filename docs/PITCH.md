# Meet: pitch (matches what is actually built)

**One line:** Meet keeps your money in dollars, buys the naira your staff and bills need just before they're due, and pays them on time, with a record of what it cost.

Built on Celo for "Agents on Open Rails". Tracks: Textile FX and Build with buy.

## The problem

Many Nigerian freelancers, agencies and online sellers earn in dollars but pay staff, rent and suppliers in naira. The habit is to convert on payday, then the naira can slide before rent is due. On top of that you pay the street spread and take P2P scam risk.

## What Meet does

1. **Tell it once.** Who to pay, how much in naira, and when.
2. **It holds dollars.** Your USD₮ stays in your own wallet.
3. **It converts just in time.** Inside each bill's 3-day window, code picks the moment. It compares Textile and Uniswap and takes the cheaper, never past the worst rate you signed.
4. **It pays.** cNGN goes straight to your payee.
5. **It shows the numbers.** Every payment records its rate, venue, transaction links, and how it compares with converting on day 1 and with the street rate. Those comparisons can come out worse as well as better, and the ledger shows either.

Presets: SME payroll, supplier invoices, and bills with monthly repeat.

## How it decides

- A paid news check through buy (X search, cross-checked with Reddit search) can bring a conversion forward if a naira shock is reported on both.
- Otherwise it converts 12 hours before the due date, or earlier if the rate beats the day-1 rate by 0.5%.
- These are tested rules in code. No LLM is involved.
- Exposure guard: caps on payment size and on cNGN held, a stop-loss, a hold timer and a kill switch.

## Who holds what

Your dollars stay in your wallet until your payee is paid. Meet buys naira first with its own float and bears that risk. Then one transaction takes your dollars and delivers the naira to your payee, or reverts and moves nothing.

Each payment is a signed limit: the exact naira the payee gets, the most dollars you'll pay, the window, and the payee. The contract rejects anything else. You can cancel any payment that hasn't gone out.

If a payment can't complete, the naira stays Meet's problem. It retries within the hold limit, then sells it back, and you're told "Not paid, no funds moved."

## Why it fits the tracks

**Textile FX:** a treasury agent that converts on a business's schedule. Textile volume is real taker volume against outside makers. Meet does not quote as a maker, so it cannot trade against itself.

**Build with buy:** paid X and Reddit searches feed the decision to convert early. A paid x402 rate feed lets other agents buy Meet's rate board.

## Proof on Celo mainnet

- MeetSettlement: `0x666792B9eF14D6Ca9AAEee598784efcfD2840591`
- ERC-8004 agentId 10044; attribution tag `celo_8d6bd2780c7d`
- Test payments so far: 1 via Textile, 2 via Uniswap, between the builder's own wallets
- App: https://usemeet.website · Ledger: https://usemeet.website/dashboard

## Honest limits

- Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.
- Capped at $1.10 per payment. Textile's minimum quote is about ₦1,378.
- The contract has tests but no audit.
- Not built: Textile maker quoting, silent netting, LLM receipts (the catalog's only model is retired), wallet screening (no such service in the catalog), bank payouts.
- Payees need a Celo wallet. Cashing out is a link to the Noblocks ramp, whose route settles on BNB Chain.
