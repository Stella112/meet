import type { Senses } from "./engine.js";
import { buyCall } from "./paid.js";
import type { News } from "./types.js";

// News sense: paid X search and Reddit search through buy (catalog `x.posts.search` and `reddit.posts.search`,
// $0.005 each), then a deterministic rule.
// The catalog's only LLM (Cencori maximo-atlas-1.3) was retired upstream on 2026-11-06, so code classifies.
export const X_SEARCH_URL = "https://gateway.usebuy.ai/v1/social/x/posts/search";
export const X_SEARCH_PRICE = 5_000n; // atomic USDT
export const NEWS_QUERY = '(naira OR CBN) (devaluation OR devalue OR crash OR plunge OR "exchange rate" OR "dollar rate") within_time:1d';

export const REDDIT_SEARCH_URL = "https://gateway.usebuy.ai/v1/social/reddit/posts/search";
export const REDDIT_SEARCH_PRICE = 5_000n; // atomic USDT
export const REDDIT_QUERY = "naira devaluation OR naira crash OR CBN exchange rate";

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

/** Reddit posts from the gateway envelope (shape seen in paid call 0x4f61…6694). Title is used only if present. */
export function redditPostsFrom(body: unknown): Post[] {
  const children = (body as { output?: { children?: unknown[] } })?.output?.children;
  if (!Array.isArray(children)) return [];
  return children.flatMap((c) => {
    const post = (c as { post?: { authorInfo?: { name?: unknown }; content?: { markdown?: unknown }; title?: unknown } })?.post;
    const text = [post?.title, post?.content?.markdown].filter((t): t is string => typeof t === "string").join(". ");
    return text ? [{ author: String(post?.authorInfo?.name ?? ""), text }] : [];
  });
}

/**
 * Two platforms as a cross-check. Shock needs two accounts overall and, when both platforms answered,
 * at least one shock report on each, so one noisy platform cannot move money on its own.
 */
export function classifyCrossCheck(x: Post[] | null, reddit: Post[] | null): News {
  if (!x && !reddit) return "unknown";
  if (!x || !reddit) return classifyPosts((x ?? reddit)!);
  const flagged = (posts: Post[]) => posts.some((p) => isShockPost(p.text));
  return classifyPosts([...x, ...reddit]) === "shock" && flagged(x) && flagged(reddit) ? "shock" : "normal";
}

/** X plus Reddit. Each source is tried once and recorded on its own; a failed source is maybe-paid and left out. */
export function crossCheckNewsSense(account: string): Senses {
  return {
    newsPrice: X_SEARCH_PRICE + REDDIT_SEARCH_PRICE,
    async news() {
      const calls: { service: string; atomic: bigint; tx: string | null; ok: boolean }[] = [];
      const run = async (service: string, url: string, body: unknown, price: bigint, parse: (b: unknown) => Post[]) => {
        try {
          const r = await buyCall(url, body, { account, maxUsd: "0.01" });
          calls.push({ service, atomic: price, tx: r.tx, ok: r.ok });
          return r.ok ? parse(r.body) : null;
        } catch {
          calls.push({ service, atomic: price, tx: null, ok: false });
          return null;
        }
      };
      const x = await run("x.posts.search", X_SEARCH_URL, { query: NEWS_QUERY, type: "latest" }, X_SEARCH_PRICE, postsFrom);
      const reddit = await run("reddit.posts.search", REDDIT_SEARCH_URL, { query: REDDIT_QUERY, type: "post", sort: "new", timeRange: "day" }, REDDIT_SEARCH_PRICE, redditPostsFrom);
      return { value: classifyCrossCheck(x, reddit), tx: calls.find((c) => c.tx)?.tx ?? null, calls };
    },
  };
}
