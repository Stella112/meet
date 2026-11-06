import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isLive, loadConfig } from "./config.js";
import { obligationSchema, validateObligation } from "./eip712.js";
import { runBatch, type Deps, type Executor } from "./engine.js";
import { DryRunExecutor } from "./dryExecutor.js";
import { LiveExecutor, liveChain, liveQuotes } from "./live.js";
import { textilePreviewBuy } from "./liveQuotes.js";
import { xNewsSense } from "./news.js";
import { Store } from "./store.js";
import { freshStreet, streetEntry, tokenOk } from "./street.js";
import type { Address, Hex, StoredObligation } from "./types.js";

// Agent API for the web app plus the batch loop. Dry-run unless both live flags are set.
const cfg = loadConfig();
const PORT = Number(process.env.AGENT_PORT ?? 8797);
const settlement = process.env.MEET_SETTLEMENT_ADDRESS as Address;
const clock = () => Math.floor(Date.now() / 1000);
// Dry-run results go to their own file so simulated payments never mix with real ones.
const dbPath = new URL(isLive(cfg) ? "../data/ledger.sqlite" : "../data/ledger.dry.sqlite", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("%20", " ");
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const store = new Store(dbPath);
const quotes = liveQuotes(cfg, clock);
const exec: Executor = isLive(cfg)
  ? new LiveExecutor(cfg, settlement, process.env.AGENT_PRIVATE_KEY as Hex, process.env.ATTRIBUTION_TAG!, clock, (m) => console.log(m))
  : new DryRunExecutor(clock);

const deps: Deps = {
  cfg,
  store,
  exec,
  quotes,
  chain: liveChain(cfg, settlement),
  // Paid news spends real money even in dry-run, so it has its own switch and needs a buy account on this machine.
  senses:
    process.env.PAID_NEWS === "true" && process.env.BUY_ACCOUNT_NAME
      ? xNewsSense(process.env.BUY_ACCOUNT_NAME)
      : { newsPrice: 0n, news: async () => ({ value: "unknown", tx: null }) },
  notify: { tell: (o, m) => store.log(clock(), o.id, "told_user", m) },
};

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("body too large");
  }
  return JSON.parse(raw);
}

/** Plain-English next action and its reason, from status and the last logged decision. */
function nextAction(o: StoredObligation, now: number): string {
  const due = Number(o.o.expiry);
  const buffer = due - cfg.CONVERT_BUFFER_HOURS * 3600;
  switch (o.status) {
    case "paid":
      return "Paid.";
    case "buying":
      return "Payment under review. Your funds have not moved.";
    case "bought":
      return "Naira bought. Paying your payee.";
    case "pending": {
      if (now < Number(o.o.validAfter)) return `Holding your dollars. Window opens ${new Date(Number(o.o.validAfter) * 1000).toISOString()}.`;
      const last = store.lastEvent(o.id);
      const note = last && ["not_converted", "skipped", "guard_block"].includes(last.kind) ? ` Last check: ${last.detail}.` : "";
      return `Holding your dollars. Converts by ${new Date(Math.max(buffer, now) * 1000).toISOString()}, or sooner if the rate beats your day-1 rate by ${cfg.EARLY_EDGE_BPS / 100}% or news flags a naira shock.${note}`;
    }
    default:
      return "Not paid, no funds moved.";
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, `http://localhost:${PORT}`);
    const now = clock();

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, {
        settlement,
        maxObligationUsdt: cfg.MAX_OBLIGATION_USD,
        feeBps: cfg.PROTOCOL_FEE_BPS,
        bufferHours: cfg.CONVERT_BUFFER_HOURS,
        live: isLive(cfg),
        textileMinCngn: "1377406000", // from a live 400 response, see docs/VERIFIED.md
      });
    }

    if (req.method === "GET" && url.pathname === "/api/quote") {
      const naira = BigInt(url.searchParams.get("naira") ?? "0");
      if (naira <= 0n || naira > 10_000_000n) return json(res, 400, { error: "bad amount" });
      const cngn = naira * 1_000_000n;
      const [t, u] = await Promise.all([quotes.textileBuy(cngn), quotes.uniswapBuy(cngn)]);
      return json(res, 200, { cngn, textile: t?.usdtIn ?? null, uniswap: u?.usdtIn ?? null, at: now });
    }

    if (req.method === "POST" && url.pathname === "/api/obligations") {
      const body = (await readBody(req)) as { items: { label: string; message: unknown; sig: string }[] };
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 24) return json(res, 400, { error: "1 to 24 items" });
      const parsed = body.items.map((it) => ({ label: String(it.label ?? "").slice(0, 60), o: obligationSchema.parse(it.message), sig: it.sig as Hex }));
      for (const p of parsed) {
        const rejected = await validateObligation(p.o, p.sig, { settlement, now, maxUsd: cfg.MAX_OBLIGATION_USD });
        if (rejected) return json(res, 400, { error: `${p.label}: ${rejected}` });
        if (store.get(`${p.o.owner.toLowerCase()}-${p.o.nonce}`)) return json(res, 400, { error: `${p.label}: duplicate nonce` });
      }
      const saved: string[] = [];
      for (const p of parsed) {
        // Day-1 baseline taken by the agent at signing time, never supplied by the client.
        const day1 = await quotes.textileBuy(p.o.buyAmount) ?? (await textilePreviewBuy(p.o.buyAmount, now));
        const base = day1 ?? (await quotes.uniswapBuy(p.o.buyAmount));
        if (!base) return json(res, 503, { error: "no rate available for the day-1 baseline; nothing after this was saved", saved });
        const id = `${p.o.owner.toLowerCase()}-${p.o.nonce}`;
        store.add({
          id,
          label: p.label || "Payment",
          o: p.o,
          sig: p.sig,
          day1: { usdt: base.usdtIn, cngn: p.o.buyAmount, source: `${base.venue} quote`, at: now },
          status: "pending",
          takerAtDue: false,
          lot: null,
        });
        store.log(now, id, "accepted", p.label);
        saved.push(id);
      }
      return json(res, 200, { saved });
    }

    if (req.method === "GET" && url.pathname === "/api/obligations") {
      const owner = url.searchParams.get("owner") ?? "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return json(res, 400, { error: "owner required" });
      const ledger = store.ledger();
      const items = store
        .byOwner(owner)
        .sort((a, b) => Number(a.o.expiry - b.o.expiry))
        .map((o) => ({
          id: o.id,
          label: o.label,
          recipient: o.o.recipient,
          naira: o.o.buyAmount / 1_000_000n,
          maxSellAmount: o.o.maxSellAmount,
          validAfter: o.o.validAfter,
          due: o.o.expiry,
          nonce: o.o.nonce,
          status: o.status,
          next: nextAction(o, now),
          receipt: ledger.find((r) => r.obligationId === o.id) ?? null,
        }));
      return json(res, 200, { items, live: isLive(cfg) });
    }

    if (req.method === "GET" && url.pathname === "/api/street") {
      const s = store.street();
      return json(res, 200, {
        street: s ? { nairaPerUsd: Number(s.cngn) / Number(s.usdt), source: s.source, at: s.at } : null,
        fresh: freshStreet(s, now, cfg.STREET_MAX_AGE_HOURS) !== null,
        maxAgeHours: cfg.STREET_MAX_AGE_HOURS,
        entryEnabled: !!process.env.STREET_TOKEN,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/street") {
      if (!tokenOk(req.headers.authorization, process.env.STREET_TOKEN)) return json(res, 401, { error: "not allowed" });
      const body = (await readBody(req)) as { rate?: unknown; source?: unknown };
      const obs = streetEntry(body.rate, body.source, now);
      if (typeof obs === "string") return json(res, 400, { error: obs });
      store.setStreet(obs);
      store.log(now, null, "street", `${Number(obs.cngn) / 1e6} NGN/USD ${obs.source}`);
      return json(res, 200, { saved: { nairaPerUsd: Number(obs.cngn) / 1e6, source: obs.source, at: obs.at } });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e).slice(0, 300) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`agent API on http://127.0.0.1:${PORT} (${isLive(cfg) ? "LIVE" : "dry-run"})`));

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runBatch(deps, clock());
  } catch (e) {
    console.error("batch error", e);
  } finally {
    running = false;
  }
}, cfg.BATCH_SECONDS * 1000);
