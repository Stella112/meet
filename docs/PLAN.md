# Plan v3: deadline Mon 9 Nov 2026, 09:00 GMT

Each task has one verification command. Feature freeze Sunday evening.

## Phase 1: Contract (Thu)

| Task | Verify |
|---|---|
| Replace MeetSettlement with the `Obligation` version; unit tests from 5.1 | `forge test --no-match-contract Fork` |
| Fork test with real USDT and cNGN | `forge test --match-contract Fork --fork-url https://forno.celo.org` |
| viem signature matches contract hash | `pnpm --filter agent vitest run eip712` |
| Tagged deploy (gate) and source verification | `cast code $MEET_SETTLEMENT_ADDRESS --rpc-url https://forno.celo.org` |

## Phase 2: Agent (Thu–Fri)

| Task | Verify |
|---|---|
| Intents and storage | `pnpm --filter agent vitest run intents` |
| Scheduler and decision rule | `pnpm --filter agent vitest run decision` |
| Router: Textile exact-out vs Uniswap | `pnpm --filter agent vitest run router` |
| Caps, guard, stop rule, dry-run, kill switch | `pnpm --filter agent vitest run guard` |
| Baselines and savings maths | `pnpm --filter agent vitest run savings` |
| Recovery and unwind | `pnpm --filter agent vitest run recovery` |
| Fixture dry-run | `pnpm --filter agent dry-run:fixtures` |
| One live payment via Textile, one via Uniswap | `cast receipt <tx> --rpc-url https://forno.celo.org` per tx |

## Phase 3: Web (Fri–Sat)

| Task | Verify |
|---|---|
| **First:** MiniPay spike on a phone: EIP-712, approve, cNGN visible to payee | `cast tx <approve-tx> --rpc-url https://forno.celo.org` shows the tag |
| Payroll, Supplier, Bills presets; calendar; receipts; cancel | `cast receipt <settle-tx> --rpc-url https://forno.celo.org` from a phone-made plan |

## Phase 4: buy, attribution, identity (Fri–Sat)

| Task | Verify |
|---|---|
| X search as news sense, one paid call | `cast receipt <payment-tx> --rpc-url https://forno.celo.org` (done: 0xabc1…6bc, 0xd92b…93a) |
| Cencori classification and receipts, one paid call | Blocked 2026-11-06: gateway only accepts `maximo-atlas-1.3`, which Cencori has retired. News uses a tested rule instead |
| Tags on every tx | `pnpm --filter agent check-tags` |
| ERC-8004 and agent card | `cast logs` for `Registered` from the agent wallet |

## Phase 5: Maker, dashboard, P1 (Sat)

| Task | Verify |
|---|---|
| Stitch feed (if access granted) | `cast receipt <maker-fill-tx> --rpc-url https://forno.celo.org` |
| Dashboard from ledger | `pnpm --filter agent vitest run dashboard` |
| P1 in order: netting, x402, failed-limit proof | `node scripts/failed-limit.mjs` (others get own command when started) |

## Phase 6: Users, README, demo (Sat–Sun)

| Task | Verify |
|---|---|
| Kit and eligibility checker | `node scripts/eligibility.mjs <addr>` (checker done 2026-11-06; kit not started) |
| README | `node scripts/check-readme.mjs` |
| Submission | `grep -c TBD-post-build docs/SUBMISSION.md` returns 0 |
| Secrets | `git log -p \| grep -i "private\|key"` reviewed |

## Risks

1. Maker pricing: market spread is about 2.5 bps, so a 15 bps improvement probably never wins an RFQ.
2. Maker fills also depend on takers selling cNGN, which is unknown.
3. MiniPay: cNGN display, EIP-712 and approve are unconfirmed, and they underpin the demo.
4. The solver chooses `sellAmount`, so it could charge up to the 3% worst rate. Only the ledger shows fairness.
5. Noblocks link settles on BNB Chain, while payees hold cNGN on Celo.
6. Street rate is manual, so a missed daily entry means "no data".
7. Cencori is closed beta. If it fails, receipts use the template and news stays `unknown`.
8. Eligible independent wallets remain the hardest qualifier.
9. Registration needs a public repo; the tag must exist before deploy.
10. 4.5 days. Maker is the approved first cut.
