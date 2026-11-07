"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useConnect, useConnection, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { celo } from "wagmi/chains";
import { CNGN, erc20, naira, obligationTypes, publicClient, settlementAbi, short, TAG, txLink, USDT } from "@/lib/chain";

type Preset = "payroll" | "supplier" | "bills";
type Row = { label: string; wallet: string; naira: string };
type AgentConfig = { settlement: `0x${string}`; maxObligationUsdt: string; bufferHours: number; live: boolean; textileMinCngn: string };
type Street = { street: null | { nairaPerUsd: number; source: string; at: number }; fresh: boolean };
type Item = {
  id: string;
  label: string;
  recipient: string;
  naira: string;
  maxSellAmount: string;
  due: string;
  nonce: string;
  status: string;
  next: string;
  receipt: null | { venue: string; paidUsdt: string; buyTx: string; settleTx: string; vsStreet: string; vsDay1: string; rule: string };
};
type Stats = { payments: { paid: number; deliveredCngn: string; paidUsdt: string } };

const PRESETS: Record<Preset, { title: string; blurb: string; rowName: string; amountName: string; dateName: string; repeat: boolean }> = {
  payroll: { title: "Pay staff", blurb: "Salaries on payday", rowName: "Their name", amountName: "Salary in naira (₦)", dateName: "Payday", repeat: false },
  supplier: { title: "Pay a supplier", blurb: "An invoice by its due date", rowName: "Supplier or invoice", amountName: "Invoice in naira (₦)", dateName: "Due date", repeat: false },
  bills: { title: "Pay a bill", blurb: "Rent, power, school fees", rowName: "What is it for?", amountName: "Amount in naira (₦)", dateName: "Due date", repeat: true },
};
const TOLERANCE_BPS = 300n;
const WINDOW_DAYS = 3;
const usd2 = (atomic: bigint | string) => (Number(atomic) / 1e6).toFixed(2);

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "plain" }> = {
  pending: { label: "Scheduled", tone: "plain" },
  buying: { label: "Paying now", tone: "warn" },
  bought: { label: "Paying now", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  cancelled: { label: "Cancelled", tone: "plain" },
  expired: { label: "Not paid · no money moved", tone: "warn" },
  failed: { label: "Not paid · no money moved", tone: "warn" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Meet?",
    a: "Meet pays naira bills for people who earn in dollars. You keep your dollars, tell Meet who to pay and when, and Meet sends the naira on time. You don't have to convert on payday and lose value to the street rate.",
  },
  {
    q: "What do I need to try it?",
    a: "A Celo wallet such as MiniPay, and a few dollars of USD₮ in it. The person you pay needs a Celo wallet that can hold cNGN, a naira stablecoin they can cash out to a bank.",
  },
  {
    q: "Can Meet take my money?",
    a: "No. You allow Meet to use only the exact amount for the payments you schedule, and you sign each payment yourself. The contract can only pay the person you named, never more than your worst case, and only before the due date. You can cancel any time before it's paid.",
  },
  {
    q: "What does it cost?",
    a: "A 0.1% fee, taken inside the amount you approved. You always see an \"about\" price and a \"never more than\" price before you confirm. After it's paid, the receipt shows what you paid and how it compares with converting on day one and with the street rate.",
  },
  {
    q: "What if Meet can't pay on time?",
    a: "Then the payment is marked \"Not paid\" and no money moves from your wallet. Meet buys the naira first with its own money, so the risk of a bad rate is Meet's, not yours.",
  },
  {
    q: "Is this a bank or a licensed service?",
    a: "No. It's a hackathon prototype on Celo with small limits (about $1.10 per payment right now). A regulatory review is needed before a real launch.",
  },
];

export default function Home() {
  const { address, isConnected, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [preset, setPreset] = useState<Preset>("payroll");
  const [rows, setRows] = useState<Row[]>([{ label: "", wallet: "", naira: "" }]);
  const [dueDate, setDueDate] = useState("");
  const [repeat, setRepeat] = useState(1);
  const [quote, setQuote] = useState<{ usdtPerNaira: number; source: string; at: number } | null>(null);
  const [street, setStreet] = useState<Street | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => setMsg("Meet is offline right now. Try again in a minute."));
    fetch("/api/street").then((r) => r.json()).then(setStreet).catch(() => {});
    fetch("/api/dashboard").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    const r = await fetch(`/api/obligations?owner=${address}`).then((x) => x.json());
    if (r.items) setItems(r.items);
  }, [address]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // A live Textile rate (Uniswap if Textile has none), never a made-up number.
  useEffect(() => {
    fetch("/api/quote?naira=1400")
      .then((r) => r.json())
      .then((q) => {
        const best = [q.textile, q.uniswap].filter(Boolean).map(BigInt).sort((a, b) => (a < b ? -1 : 1))[0];
        if (best) setQuote({ usdtPerNaira: Number(best) / 1e6 / 1400, source: q.textile ? "Textile" : "Uniswap", at: q.at });
      })
      .catch(() => {});
  }, []);

  const plan = useMemo(() => {
    if (!quote || !dueDate || !address) return null;
    const firstDue = Math.floor(new Date(`${dueDate}T17:00:00`).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const out: { label: string; recipient: string; naira: bigint; cost: bigint; max: bigint; validAfter: number; due: number }[] = [];
    for (let m = 0; m < (PRESETS[preset].repeat ? repeat : 1); m++) {
      const d = new Date(firstDue * 1000);
      d.setMonth(d.getMonth() + m);
      const due = Math.floor(d.getTime() / 1000);
      for (const r of rows) {
        const n = BigInt(r.naira || "0");
        if (n <= 0n || !isAddress(r.wallet)) return null;
        const cost = BigInt(Math.ceil(Number(n) * quote.usdtPerNaira * 1e6));
        const label = `${PRESETS[preset].title}: ${r.label || short(r.wallet)}${m ? ` (month ${m + 1})` : ""}`;
        out.push({ label, recipient: r.wallet, naira: n, cost, max: (cost * (10_000n + TOLERANCE_BPS)) / 10_000n, validAfter: Math.max(now - 60, due - WINDOW_DAYS * 86400), due });
      }
    }
    return out.some((o) => o.due <= now) ? null : out;
  }, [quote, dueDate, address, rows, preset, repeat]);

  // The first thing still missing, in plain words, so a disabled button always explains itself.
  const problem = useMemo(() => {
    if (!dueDate) return `Choose a ${PRESETS[preset].dateName.toLowerCase()}.`;
    if (rows.some((r) => !isAddress(r.wallet) || BigInt(r.naira || "0") <= 0n)) return "Fill in each person's wallet address and amount.";
    if (!quote) return "Loading today's rate…";
    if (!plan) return "That date has passed. Payments are due at 5 pm on the day.";
    return "";
  }, [dueDate, rows, quote, plan, preset]);

  const total = plan?.reduce((s, o) => s + o.max, 0n) ?? 0n;
  const expected = plan?.reduce((s, o) => s + o.cost, 0n) ?? 0n;
  const totalNaira = plan?.reduce((s, o) => s + o.naira, 0n) ?? 0n;
  const overCap = !!cfg && !!plan?.some((o) => o.max > BigInt(cfg.maxObligationUsdt));
  const belowTextile = !!cfg && !!plan?.some((o) => o.naira * 1_000_000n < BigInt(cfg.textileMinCngn));

  async function submit() {
    if (!plan || !wallet || !address || !cfg) return;
    setMsg("");
    try {
      setBusy("Checking your dollars…");
      const [bal, allowance] = await Promise.all([
        publicClient.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [address] }),
        publicClient.readContract({ address: USDT, abi: erc20, functionName: "allowance", args: [address, cfg.settlement] }),
      ]);
      if (bal < total) throw new Error(`You need at least $${usd2(total)} in USD₮ for the worst case, and you have $${usd2(bal)}. Add dollars to your wallet and try again.`);
      setBusy("Step 1 of 2: allow Meet to use this amount (check your wallet)…");
      const hash = await wallet.writeContract({
        address: USDT,
        abi: erc20,
        functionName: "approve",
        args: [cfg.settlement, allowance + total],
        dataSuffix: TAG,
        chain: celo,
        account: address,
      });
      setBusy("Confirming…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The approval didn't go through. Nothing was scheduled.");
      const signed = [];
      const base = BigInt(Date.now()) * 1000n;
      for (const [i, o] of plan.entries()) {
        setBusy(plan.length > 1 ? `Step 2 of 2: sign payment ${i + 1} of ${plan.length}…` : "Step 2 of 2: sign the payment (check your wallet)…");
        const message = {
          owner: address,
          recipient: o.recipient as `0x${string}`,
          sellToken: USDT,
          buyToken: CNGN,
          buyAmount: o.naira * 1_000_000n,
          maxSellAmount: o.max,
          validAfter: BigInt(o.validAfter),
          expiry: BigInt(o.due),
          nonce: base + BigInt(i),
        };
        const sig = await wallet.signTypedData({
          account: address,
          domain: { name: "MeetSettlement", version: "1", chainId: celo.id, verifyingContract: cfg.settlement },
          types: obligationTypes,
          primaryType: "Obligation",
          message,
        });
        signed.push({ label: o.label, sig, message: Object.fromEntries(Object.entries(message).map(([k, v]) => [k, String(v)])) });
      }
      setBusy("Scheduling…");
      const r = await fetch("/api/obligations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: signed }) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setMsg(`Done. ${r.saved.length === 1 ? "Your payment is" : `${r.saved.length} payments are`} scheduled. Watch it in "Your payments" below.`);
      setRows([{ label: "", wallet: "", naira: "" }]);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy("");
    }
  }

  async function cancel(it: Item) {
    if (!wallet || !address || !cfg) return;
    try {
      setBusy("Confirm the cancellation in your wallet…");
      const hash = await wallet.writeContract({
        address: cfg.settlement,
        abi: settlementAbi,
        functionName: "cancel",
        args: [BigInt(it.nonce)],
        dataSuffix: TAG,
        chain: celo,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg(`Cancelled: ${it.label}. No money moved.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy("");
    }
  }

  const P = PRESETS[preset];
  const rate = quote ? Math.round(1 / quote.usdtPerNaira) : null;

  if (!isConnected) return <Landing cfg={cfg} stats={stats} rate={rate} source={quote?.source} street={street} msg={msg} />;

  if (chainId !== celo.id) {
    return (
      <section className="card max-w-xl mx-auto space-y-3 text-center">
        <h1 className="section-title">One quick thing: switch to Celo</h1>
        <p className="muted">Your wallet is connected to this site on a different network. Meet runs on Celo.</p>
        <SwitchToCelo />
        <p className="hint">
          Or change the network for this site inside your wallet, or <SwitchWallet />.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-1">
        <h1 className="section-title">Pay someone in naira</h1>
        <p className="muted">Fill in three things. You'll see exactly what it costs before you confirm.</p>
        {cfg && !cfg.live && <p className="badge badge-warn">Practice mode: payments are simulated and nothing is sent</p>}
      </section>

      <div className="grid gap-6 md:grid-cols-5 items-start">
        <section className="card space-y-5 md:col-span-3">
          <div>
            <p className="label">What are you paying?</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESETS) as Preset[]).map((p) => (
                <button key={p} className="chip" aria-pressed={p === preset} onClick={() => setPreset(p)}>
                  {PRESETS[p].title}
                </button>
              ))}
            </div>
            <p className="hint">{P.blurb}</p>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="space-y-3 pb-5 border-b" style={{ borderColor: "var(--line)" }}>
              <div>
                <label className="label">{P.rowName}</label>
                <input className="field" placeholder="e.g. Ada" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </div>
              <div>
                <label className="label">Their wallet address</label>
                <input
                  className="field"
                  placeholder="0x…"
                  value={r.wallet}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, wallet: e.target.value.trim() } : x)))}
                />
                {r.wallet && !isAddress(r.wallet) ? (
                  <p className="hint" style={{ color: "var(--warn)" }}>That doesn't look like a wallet address. It starts with 0x and is 42 characters long.</p>
                ) : (
                  <p className="hint">The Celo wallet that will receive the naira.</p>
                )}
              </div>
              <div>
                <label className="label">{P.amountName}</label>
                <input className="field" inputMode="numeric" placeholder="e.g. 1400" value={r.naira} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, naira: e.target.value.replace(/\D/g, "") } : x)))} />
              </div>
            </div>
          ))}
          <button className="chip" onClick={() => setRows([...rows, { label: "", wallet: "", naira: "" }])}>+ Add another person</button>

          <div>
            <label className="label">{P.dateName}</label>
            <input type="date" className="field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="hint">Meet pays during the {WINDOW_DAYS} days before this date, at the best moment it finds. Payments are due at 5 pm.</p>
          </div>

          {P.repeat && (
            <div>
              <label className="label">Repeat every month for</label>
              <select className="field" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                {[1, 2, 3, 6].map((n) => (
                  <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        <aside className="space-y-4 md:col-span-2 md:sticky md:top-4">
          <div className="card space-y-3">
            <h2 className="font-semibold">Your summary</h2>
            {plan ? (
              <>
                <div>
                  <p className="muted text-sm">They receive</p>
                  <p className="stat">{naira(totalNaira)}</p>
                </div>
                <div>
                  <p className="muted text-sm">You pay about</p>
                  <p className="text-2xl font-semibold">${usd2(expected)}</p>
                  <p className="hint">Never more than ${usd2(total)}. That's today's rate plus 3% protection, and you usually pay less.</p>
                </div>
                {overCap && <p className="badge badge-warn">Over the prototype limit of ${usd2(cfg!.maxObligationUsdt)} per payment</p>}
                {belowTextile && !overCap && <p className="hint">Small payments under ₦1,378 are routed through Uniswap.</p>}
              </>
            ) : (
              <p className="muted text-sm">Your summary appears here once you've filled in the form.</p>
            )}
            <div className="text-sm muted border-t pt-3 space-y-1" style={{ borderColor: "var(--line)" }}>
              {quote ? (
                <p>
                  Today's rate: <strong className="text-[color:var(--ink)]">{naira(rate!)} per $1</strong> ({quote.source})
                </p>
              ) : (
                <p>Loading today's rate…</p>
              )}
              {street?.fresh && street.street ? (
                <p>Street rate today: {naira(Math.round(street.street.nairaPerUsd))} per $1 ({street.street.source.replace(/^manual: /, "")})</p>
              ) : (
                <p>Street rate: not entered today</p>
              )}
            </div>
            <button className="btn" disabled={!plan || overCap || !!busy || !wallet} onClick={submit}>
              {busy || "Schedule payment"}
            </button>
            {!busy && problem && !overCap && <p className="hint text-center">{problem}</p>}
            {msg && <p className="text-sm font-medium">{msg}</p>}
            <p className="hint text-center">Your dollars stay in your wallet until they're paid. You can cancel before then.</p>
          </div>
        </aside>
      </div>

      <section className="space-y-3" id="payments">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">Your payments</h2>
          <p className="hint">
            <SwitchWallet /> · {short(address ?? "")}
          </p>
        </div>
        {items.length === 0 && (
          <div className="card text-center muted">
            <p>No payments yet. Schedule your first one above.</p>
          </div>
        )}
        {items.map((it) => (
          <PaymentCard key={it.id} it={it} busy={!!busy} onCancel={() => cancel(it)} />
        ))}
      </section>
    </>
  );
}

function PaymentCard({ it, busy, onCancel }: { it: Item; busy: boolean; onCancel: () => void }) {
  const s = STATUS[it.status] ?? { label: it.status, tone: "plain" as const };
  const clean = (t: string) => t.replace(/\s*\(.*\)\s*$/, "");
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{it.label}</p>
          <p className="muted text-sm">
            To {short(it.recipient)} · due {new Date(Number(it.due) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold">{naira(it.naira)}</p>
          <span className={`badge ${s.tone === "good" ? "badge-good" : s.tone === "warn" ? "badge-warn" : ""}`}>{s.label}</span>
        </div>
      </div>
      {!it.receipt && <p className="text-sm muted">{it.next}</p>}
      {it.receipt && (
        <div className="text-sm space-y-1 rounded-2xl p-3" style={{ background: "var(--good-bg)" }}>
          <p>
            <strong>Paid ${usd2(it.receipt.paidUsdt)}</strong> through {it.receipt.venue === "textile" ? "Textile" : "Uniswap"}.{" "}
            {it.receipt.settleTx.startsWith("0x") ? (
              <a className="underline" href={txLink(it.receipt.settleTx)} target="_blank" rel="noreferrer">View receipt on-chain</a>
            ) : (
              "Practice payment, not on-chain."
            )}
          </p>
          <p className="muted">Compared with converting on day one: {clean(it.receipt.vsDay1)}</p>
          <p className="muted">Compared with the street rate: {clean(it.receipt.vsStreet)}</p>
        </div>
      )}
      {it.status === "pending" && (
        <button className="btn btn-ghost btn-sm btn-auto" disabled={busy} onClick={onCancel}>
          Cancel this payment
        </button>
      )}
    </div>
  );
}

function Landing({ cfg, stats, rate, source, street, msg }: { cfg: AgentConfig | null; stats: Stats | null; rate: number | null; source?: string; street: Street | null; msg: string }) {
  const paid = stats?.payments.paid ?? 0;
  const delivered = stats ? Number(stats.payments.deliveredCngn) / 1e6 : 0;
  return (
    <>
      <section className="text-center max-w-3xl mx-auto pt-8 space-y-6">
        <span className="badge">Built on Celo</span>
        <h1 className="hero-title">Earn in dollars. Pay your naira bills on time.</h1>
        <p className="text-lg muted max-w-xl mx-auto">
          Keep your money in dollars. Meet buys the naira your staff, suppliers and bills need just before they're due, and shows you what it cost.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a href="#connect" className="btn btn-auto">Connect wallet to start</a>
          <a href="#how" className="btn btn-auto btn-ghost">How it works</a>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm muted">
          <li>✓ Your dollars stay in your wallet</li>
          <li>✓ Cancel any time before it's paid</li>
          <li>✓ Every payment is on-chain</li>
        </ul>
        {cfg && !cfg.live && <p className="badge badge-warn">Practice mode: payments are simulated</p>}
        {msg && <p className="text-sm">{msg}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-3 text-center">
        <div className="card space-y-1">
          <p className="muted text-sm">Naira paid out so far</p>
          <p className="stat">{stats ? naira(Math.round(delivered)) : "…"}</p>
        </div>
        <div className="card space-y-1">
          <p className="muted text-sm">Payments made</p>
          <p className="stat">{stats ? paid : "…"}</p>
        </div>
        <div className="card space-y-1">
          <p className="muted text-sm">Today's rate</p>
          <p className="stat">{rate ? naira(rate) : "…"}</p>
          <p className="hint">per $1{source ? `, ${source}` : ""}{street?.fresh && street.street ? ` · street ${naira(Math.round(street.street.nairaPerUsd))}` : ""}</p>
        </div>
      </section>

      <section id="how" className="space-y-6 pt-4">
        <h2 className="section-title text-center">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Tell Meet who to pay", "Pick staff, a supplier or a bill. Add their wallet, the amount in naira and the date."],
            ["Keep your dollars", "Your dollars stay in your wallet. You approve only the exact amount, and you can cancel any time."],
            ["Meet pays on time", "In the 3 days before the due date, Meet picks the best moment and venue, buys the naira and pays them."],
          ].map(([t, d], i) => (
            <div key={t} className="card space-y-3">
              <span className="step-num">{i + 1}</span>
              <h3 className="font-semibold text-lg">{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="text-center muted">
          After each payment you get a receipt that shows what you paid and how it compares with the street rate.{" "}
          <a className="underline" href="/dashboard">See real receipts</a>.
        </p>
      </section>

      <section id="connect" className="card max-w-xl mx-auto space-y-4 scroll-mt-6">
        <h2 className="section-title">Ready to try it?</h2>
        <p className="muted">Connect a Celo wallet. In MiniPay this happens by itself. You'll need a few dollars of USD₮ in it.</p>
        <WalletPicker />
        <p className="hint">New here? <a className="underline" href="/try">See what you need</a>.</p>
      </section>

      <section className="max-w-2xl mx-auto w-full space-y-2">
        <h2 className="section-title mb-4">Common questions</h2>
        {FAQ.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>
    </>
  );
}

function WalletPicker() {
  const { mutate, connectors, isPending, error } = useConnect();
  const inMiniPay = typeof window !== "undefined" && (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay;
  if (inMiniPay) return <p className="muted">Connecting to MiniPay…</p>;
  // Named wallets found by EIP-6963 first; the generic "Injected" entry only when nothing else was announced.
  const named = connectors.filter((c) => c.id !== "injected");
  const list = named.length ? named : connectors;
  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="muted">No wallet found. Open Meet inside MiniPay or a wallet app's browser, or install a browser wallet.</p>}
      {list.map((c) => (
        <button key={c.uid} className="btn btn-ghost" disabled={isPending} onClick={() => mutate({ connector: c })}>
          {c.icon && <img src={c.icon} alt="" width={22} height={22} />}
          {isPending ? "Check your wallet…" : `Connect ${c.name === "Injected" ? "wallet" : c.name}`}
        </button>
      ))}
      {error && <p style={{ color: "var(--warn)" }}>{error.message.split("\n")[0]}</p>}
    </div>
  );
}

function SwitchToCelo() {
  // Asks the wallet to switch; wagmi adds Celo to the wallet first if it is missing.
  const { mutate, isPending, error } = useSwitchChain();
  return (
    <div className="space-y-1">
      <button className="btn" disabled={isPending} onClick={() => mutate({ chainId: celo.id })}>
        {isPending ? "Check your wallet…" : "Switch to Celo"}
      </button>
      {error && <p style={{ color: "var(--warn)" }}>{error.message.split("\n")[0]}</p>}
    </div>
  );
}

function SwitchWallet() {
  const { mutate } = useDisconnect();
  const inMiniPay = typeof window !== "undefined" && (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay;
  if (inMiniPay) return <span>MiniPay</span>;
  return (
    <button className="underline" onClick={() => mutate()}>
      switch wallet
    </button>
  );
}
