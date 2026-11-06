import type { LedgerRow, Store } from "./store.js";
import { freshStreet } from "./street.js";

// Public, aggregate view of the ledger. Never includes payee names (labels) or owner addresses.
// Tx hashes are included: they are public on-chain and are the proof.

/** Reads "₦36.23 better (...)" / "₦5.00 worse (...)" from rows written before numeric fields existed. */
export function parseSaving(s: string): bigint | null {
  const m = /^₦([\d,]+(?:\.\d+)?) (better|worse)\b/.exec(s);
  if (!m) return null;
  const atomic = BigInt(Math.round(Number(m[1].replaceAll(",", "")) * 100)) * 10_000n;
  return m[2] === "better" ? atomic : -atomic;
}

const savedDay1 = (r: LedgerRow) => (r.savedDay1Cngn !== undefined ? r.savedDay1Cngn : parseSaving(r.vsDay1));
const savedStreet = (r: LedgerRow) => (r.savedStreetCngn !== undefined ? r.savedStreetCngn : parseSaving(r.vsStreet));

function sumKnown(values: (bigint | null)[]) {
  const known = values.filter((v): v is bigint => v !== null);
  return { totalCngn: known.reduce((a, b) => a + b, 0n), counted: known.length, missing: values.length - known.length };
}

function tally(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export function buildDashboard(store: Store, now: number, opts: { live: boolean; streetMaxAgeHours: number }) {
  const ledger = store.ledger();
  // Zero-price calls are the unpaid placeholder sense, not a paid service.
  const calls = store.paidCalls().filter((c) => c.atomic > 0n);
  const deliveredCngn = ledger.reduce((s, r) => s + r.deliveredCngn, 0n);
  const paidUsdt = ledger.reduce((s, r) => s + r.paidUsdt, 0n);
  const street = store.street();
  const news = store.lastNews();
  return {
    live: opts.live,
    at: now,
    payments: {
      paid: ledger.length,
      byStatus: store.statusCounts(),
      deliveredCngn,
      paidUsdt,
      // Naira delivered per $1 paid, fees included; null before the first payment.
      nairaPerUsd: paidUsdt > 0n ? Number(deliveredCngn) / Number(paidUsdt) : null,
      byVenue: tally(ledger.map((r) => r.venue)),
      byRule: tally(ledger.map((r) => r.rule)),
    },
    savings: {
      vsDay1: sumKnown(ledger.map(savedDay1)),
      vsStreet: sumKnown(ledger.map(savedStreet)),
    },
    services: {
      calls: calls.length,
      failed: calls.filter((c) => !c.ok).length,
      // Failed calls count: a failure may still have been paid.
      spentUsdt: calls.reduce((s, c) => s + c.atomic, 0n),
      recent: calls.slice(-5).reverse().map((c) => ({ day: c.day, service: c.service, usdt: c.atomic, tx: c.tx, ok: c.ok })),
    },
    news: news ? { value: news.value, at: news.at } : null,
    street: street ? { nairaPerUsd: Number(street.cngn) / Number(street.usdt), source: street.source, at: street.at, fresh: freshStreet(street, now, opts.streetMaxAgeHours) !== null } : null,
    recent: ledger
      .slice(-10)
      .reverse()
      .map((r) => ({
        at: r.at,
        venue: r.venue,
        rule: r.rule,
        paidUsdt: r.paidUsdt,
        deliveredCngn: r.deliveredCngn,
        savedDay1Cngn: savedDay1(r),
        savedStreetCngn: savedStreet(r),
        buyTx: r.buyTx,
        settleTx: r.settleTx,
      })),
  };
}
