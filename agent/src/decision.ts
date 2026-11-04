import type { News } from "./types.js";

export type Rule = "news_shock" | "buffer_reached" | "early_edge" | "wait" | "window_closed" | "expired";

export interface DecisionInput {
  now: number;
  validAfter: number;
  expiry: number;
  bufferHours: number;
  earlyEdgeBps: number;
  news: News;
  /** USDT the venue wants now, and what the same cNGN would have cost at the day-1 baseline. */
  costNow: bigint;
  costDay1: bigint;
  /** After the stop rule fired, only the due-time path may buy. */
  takerAtDue: boolean;
}

/** Deterministic. The LLM only classifies news; code decides. */
export function decide(i: DecisionInput): { act: boolean; rule: Rule } {
  if (i.now >= i.expiry) return { act: false, rule: "expired" };
  if (i.now < i.validAfter) return { act: false, rule: "window_closed" };
  if (i.now >= i.expiry - i.bufferHours * 3600) return { act: true, rule: "buffer_reached" };
  if (i.takerAtDue) return { act: false, rule: "wait" };
  if (i.news === "shock") return { act: true, rule: "news_shock" };
  if (i.costNow * 10_000n <= i.costDay1 * BigInt(10_000 - i.earlyEdgeBps)) return { act: true, rule: "early_edge" };
  return { act: false, rule: "wait" };
}
