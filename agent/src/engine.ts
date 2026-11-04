import type { Config } from "./config.js";
import { decide } from "./decision.js";
import { canBuy, canSpend, holdExceeded, stopLossHit } from "./guard.js";
import { grossUp, route } from "./router.js";
import { costAt, formatSaving, savedAgainst } from "./savings.js";
import type { Store } from "./store.js";
import type { Lot, News, StoredObligation, Venue, VenueQuote } from "./types.js";

export interface Quotes {
  textileBuy(cngn: bigint): Promise<VenueQuote | null>;
  uniswapBuy(cngn: bigint): Promise<VenueQuote | null>;
  /** Best USDT obtainable for selling cNGN now, or null when nobody quotes. */
  sellBack(cngn: bigint): Promise<{ venue: Venue; usdtOut: bigint } | null>;
}

export interface Chain {
  ownerFunds(o: StoredObligation): Promise<{ balance: bigint; allowance: bigint }>;
  isCancelled(o: StoredObligation): Promise<boolean>;
}

/** Everything that signs or spends. Dry-run and live implement this. */
export interface Executor {
  buy(quote: VenueQuote, cngn: bigint): Promise<Lot>;
  settle(o: StoredObligation, sellAmount: bigint): Promise<string>;
  unwind(lot: Lot, venue: Venue): Promise<string>;
}

export interface Senses {
  /** Price charged per call in atomic USDT, recorded before the result is known. */
  newsPrice: bigint;
  /** Exactly one attempt; never retried. */
  news(): Promise<{ value: News; tx: string | null }>;
}

export interface Notifier {
  tell(o: StoredObligation, message: string): void;
}

export interface Deps {
  cfg: Config;
  store: Store;
  quotes: Quotes;
  chain: Chain;
  exec: Executor;
  senses: Senses;
  notify: Notifier;
}

const day = (now: number) => new Date(now * 1000).toISOString().slice(0, 10);

async function newsCheck(d: Deps, now: number, anyOpen: boolean): Promise<News> {
  const last = d.store.lastNews();
  if (!anyOpen) return last?.value ?? "unknown";
  if (last && now - last.at < d.cfg.NEWS_TTL_MIN * 60) return last.value;
  const today = day(now);
  if (!canSpend(d.cfg, d.store.spentOn(today), d.senses.newsPrice)) {
    d.store.log(now, null, "news_skipped", "daily spend cap");
    return "unknown";
  }
  try {
    const r = await d.senses.news();
    d.store.recordPaidCall(today, "news", d.senses.newsPrice, r.tx, true);
    d.store.recordNews(now, r.value);
    d.store.log(now, null, "news", `${r.value} tx=${r.tx}`);
    return r.value;
  } catch (e) {
    // Maybe paid: count it, log it, never retry.
    d.store.recordPaidCall(today, "news", d.senses.newsPrice, null, false);
    d.store.recordNews(now, "unknown");
    d.store.log(now, null, "news_failed", String(e));
    return "unknown";
  }
}

async function unwind(d: Deps, o: StoredObligation, now: number, why: string): Promise<boolean> {
  const lot = o.lot!;
  const back = await d.quotes.sellBack(lot.cngn);
  if (!back) {
    d.store.log(now, o.id, "unwind_blocked", `${why}: no sell quote; cNGN stays as inventory`);
    return false;
  }
  try {
    const tx = await d.exec.unwind(lot, back.venue);
    d.store.log(now, o.id, "unwound", `${why} venue=${back.venue} out=${back.usdtOut} cost=${lot.usdtCost} pnl=${back.usdtOut - lot.usdtCost} tx=${tx}`);
    return true;
  } catch (e) {
    d.store.log(now, o.id, "unwind_failed", `${why}: ${String(e)}`);
    return false;
  }
}

async function closeWithUnwind(d: Deps, o: StoredObligation, now: number, status: "expired" | "cancelled" | "failed", why: string) {
  if (o.lot && !(await unwind(d, o, now, why))) return;
  d.store.setLot(o, null, status);
  d.notify.tell(o, "Not paid, no funds moved.");
}

async function trySettle(d: Deps, o: StoredObligation, now: number, rule: string, routeReason: string) {
  const lot = o.lot!;
  const sellAmount = grossUp(lot.usdtCost, d.cfg.PROTOCOL_FEE_BPS);
  try {
    const tx = await d.exec.settle(o, sellAmount);
    const vsStreet = formatSaving(savedAgainst(o.o.buyAmount, sellAmount, d.store.street()));
    const vsDay1 = formatSaving(savedAgainst(o.o.buyAmount, sellAmount, o.day1));
    d.store.addLedger({
      obligationId: o.id,
      label: o.label,
      venue: lot.venue,
      rule,
      routeReason,
      paidUsdt: sellAmount,
      deliveredCngn: o.o.buyAmount,
      vsStreet,
      vsDay1,
      buyTx: lot.txHash,
      settleTx: tx,
      at: now,
    });
    d.store.setLot(o, null, "paid");
    d.store.log(now, o.id, "paid", `tx=${tx}`);
  } catch (e) {
    d.store.log(now, o.id, "settle_failed", String(e));
  }
}

async function handleHeld(d: Deps, o: StoredObligation, now: number) {
  const lot = o.lot!;
  if (holdExceeded(lot.boughtAt, now, d.cfg.MAX_HOLD_MINUTES)) {
    await closeWithUnwind(d, o, now, "failed", "hold_timer");
    return;
  }
  const back = await d.quotes.sellBack(lot.cngn);
  if (back && stopLossHit(lot.usdtCost, back.usdtOut, d.cfg.MAX_INVENTORY_LOSS_BPS)) {
    if (await unwind(d, o, now, "stop_loss")) {
      o.takerAtDue = true;
      d.store.setLot(o, null, "pending");
    }
    return;
  }
  await trySettle(d, o, now, "retry", "held lot");
}

async function handlePending(d: Deps, o: StoredObligation, now: number, news: News) {
  const windowOpen = now >= Number(o.o.validAfter);
  if (!windowOpen) return;

  const [textile, uniswap] = await Promise.all([d.quotes.textileBuy(o.o.buyAmount), d.quotes.uniswapBuy(o.o.buyAmount)]);
  const r = route(textile, uniswap, o.o.maxSellAmount, d.cfg.PROTOCOL_FEE_BPS);
  const costNow = r.ok ? r.quote.usdtIn : (r.quote?.usdtIn ?? 0n);

  const decision = decide({
    now,
    validAfter: Number(o.o.validAfter),
    expiry: Number(o.o.expiry),
    bufferHours: d.cfg.CONVERT_BUFFER_HOURS,
    earlyEdgeBps: d.cfg.EARLY_EDGE_BPS,
    news,
    costNow: costNow === 0n ? costAt(o.o.buyAmount, o.day1) : costNow,
    costDay1: costAt(o.o.buyAmount, o.day1),
    takerAtDue: o.takerAtDue,
  });
  d.store.log(now, o.id, "decision", decision.rule);
  if (!decision.act) return;

  if (!r.ok) {
    d.store.log(now, o.id, "not_converted", r.reason);
    if (r.reason === "above_worst_rate") d.notify.tell(o, "Rate is worse than your worst rate. Trying again next batch.");
    return;
  }

  const funds = await d.chain.ownerFunds(o);
  if (funds.balance < r.sellAmount || funds.allowance < r.sellAmount) {
    d.store.log(now, o.id, "skipped", `short funds balance=${funds.balance} allowance=${funds.allowance} need=${r.sellAmount}`);
    d.notify.tell(o, "Balance or allowance is short. Trying again next batch.");
    return;
  }

  const block = canBuy(d.cfg, r.quote.usdtIn, d.store.heldCost());
  if (block) {
    d.store.log(now, o.id, "guard_block", block);
    return;
  }

  d.store.log(now, o.id, "route", `${r.quote.venue} ${r.reason}`);
  let lot: Lot;
  try {
    lot = await d.exec.buy(r.quote, o.o.buyAmount);
  } catch (e) {
    d.store.log(now, o.id, "buy_failed", String(e));
    return;
  }
  d.store.setLot(o, lot, "bought");
  await trySettle(d, o, now, decision.rule, r.reason);
}

/** One batch of brief section 5.2. Each obligation is isolated, so one failure can't stop the rest. */
export async function runBatch(d: Deps, now: number): Promise<void> {
  if (d.cfg.PAUSED) {
    d.store.log(now, null, "paused", "kill switch: no conversions, payments or paid calls");
    return;
  }
  const open = d.store.open();
  const anyWindowOpen = open.some((o) => now >= Number(o.o.validAfter) && now < Number(o.o.expiry));
  const news = await newsCheck(d, now, anyWindowOpen);

  for (const o of open) {
    try {
      if (await d.chain.isCancelled(o)) await closeWithUnwind(d, o, now, "cancelled", "cancelled");
      else if (now >= Number(o.o.expiry)) await closeWithUnwind(d, o, now, "expired", "expired");
      else if (o.lot) await handleHeld(d, o, now);
      else await handlePending(d, o, now, news);
    } catch (e) {
      d.store.log(now, o.id, "batch_error", String(e));
    }
  }
}
