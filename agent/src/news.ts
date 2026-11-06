import type { Senses } from "./engine.js";
import { buyCall } from "./paid.js";
import type { News } from "./types.js";

// News sense: one paid X search (buy catalog `x.posts.search`, $0.005), then a deterministic rule.
// The catalog's only LLM (Cencori maximo-atlas-1.3) was retired upstream on 2026-11-06, so code classifies.
export const X_SEARCH_URL = "https://gateway.usebuy.ai/v1/social/x/posts/search";
export const X_SEARCH_PRICE = 5_000n; // atomic USDT
export const NEWS_QUERY = '(naira OR CBN) (devaluation OR devalue OR crash OR plunge OR "exchange rate" OR "dollar rate") within_time:1d';

export interface Post {
  author: string;
  text: string;
}

// Event reports only: the word "devaluation" in an opinion post is not news (seen live on 2026-11-06).
const POLICY = new RegExp(
  [
    String.raw`\b(cbn|central bank|fg|federal government|nigeria)\s+(has\s+)?(devalues|devalued|floats|floated|announces\s+(a\s+)?(new\s+)?devaluation)\b`,
    String.raw`\bnaira\s+(is|was|has been|gets|got)\s+devalued\b`,
    String.raw`\b(cbn|central bank)\s+(halts|suspends|bans|freezes)\s+(fx|forex|dollar|bdc|naira)`,
    String.raw`\b(fx|forex)\s+(trading|market|window)\s+(halted|suspended)\b`,
  ].join("|"),
  "i",
);
const DROP = /naira\b[^.%]{0,80}?\b(fall|falls|fell|drop|drops|dropped|plunge[sd]?|crash(es|ed)?|tumble[sd]?|slump(s|ed)?|depreciate[sd]?|loses?|lost|weaken(s|ed)?)\b[^.%]{0,40}?(\d+(?:\.\d+)?)\s?%/i;

/** True if one post on its own describes a shock-sized event. */
export function isShockPost(text: string): boolean {
  if (POLICY.test(text)) return true;
  const m = DROP.exec(text);
  return m !== null && Number(m[m.length - 1]) >= 3;
}

/** Shock needs two different accounts reporting it, so one loud post cannot move money. */
export function classifyPosts(posts: Post[]): News {
  const authors = new Set(posts.filter((p) => isShockPost(p.text)).map((p) => p.author.toLowerCase()));
  return authors.size >= 2 ? "shock" : "normal";
}

/** Pulls tweets out of the gateway envelope; an unexpected shape yields no posts. */
export function postsFrom(body: unknown): Post[] {
  const timeline = (body as { output?: { timeline?: unknown[] } })?.output?.timeline;
  if (!Array.isArray(timeline)) return [];
  return timeline
    .filter((t): t is { type: string; screen_name: string; text: string } => typeof (t as { text?: unknown })?.text === "string" && (t as { type?: unknown }).type === "tweet")
    .map((t) => ({ author: String(t.screen_name ?? ""), text: t.text }));
}

/** Paid sense for the engine. A failed or unreadable call throws, which the engine counts as maybe-paid and reads as unknown. */
export function xNewsSense(account: string): Senses {
  return {
    newsPrice: X_SEARCH_PRICE,
    async news() {
      const r = await buyCall(X_SEARCH_URL, { query: NEWS_QUERY, type: "latest" }, { account, maxUsd: "0.01" });
      if (!r.ok) throw new Error(`x search failed, tx=${r.tx}`);
      const posts = postsFrom(r.body);
      return { value: classifyPosts(posts), tx: r.tx };
    },
  };
}
