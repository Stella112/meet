"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useConnect, useConnection, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { celo } from "wagmi/chains";
import { CNGN, erc20, naira, obligationTypes, publicClient, settlementAbi, short, TAG, txLink, USDT } from "@/lib/chain";
import { Confetti, CountUp, Donut, Icon, Sheet, type Slice } from "../ui";

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

const PRESETS: Record<Preset, { title: string; blurb: string; icon: "staff" | "supplier" | "bill"; rowName: string; amountName: string; dateName: string; repeat: boolean; tint: string }> = {
  payroll: { title: "Pay staff", blurb: "Salaries on payday", icon: "staff", rowName: "Their name", amountName: "Salary (₦)", dateName: "Payday", repeat: false, tint: "#efe7d6" },
  supplier: { title: "Pay a supplier", blurb: "An invoice by its due date", icon: "supplier", rowName: "Supplier or invoice", amountName: "Invoice (₦)", dateName: "Due date", repeat: false, tint: "#dcebe2" },
  bills: { title: "Pay a bill", blurb: "Rent, power, school fees, monthly", icon: "bill", rowName: "What is it for?", amountName: "Amount (₦)", dateName: "Due date", repeat: true, tint: "#f6e0d6" },
};
const TOLERANCE_BPS = 300n;
const WINDOW_DAYS = 3;
const usd2 = (atomic: bigint | string | number) => (Number(atomic) / 1e6).toFixed(2);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const emptyRow = (): Row => ({ label: "", wallet: "", naira: "" });

/** "₦13.82 worse (…)" -> -13.82, or null for "no data". */
function savingOf(text: string): number | null {
  const m = /^₦([\d,]+(?:\.\d+)?) (better|worse)/.exec(text);
  if (!m) return null;
  const n = Number(m[1].replaceAll(",", ""));
  return m[2] === "better" ? n : -n;
}
const signedNaira = (n: number) => `₦${Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${n >= 0 ? "better" : "worse"}`;

const GROUPS: { key: string; label: string; color: string; statuses: string[] }[] = [
  { key: "scheduled", label: "Scheduled", color: "#1a1a18", statuses: ["pending"] },
  { key: "paying", label: "Paying now", color: "#a67c37", statuses: ["buying", "bought"] },
  { key: "paid", label: "Paid", color: "#1e6b4a", statuses: ["paid"] },
  { key: "closed", label: "Not paid", color: "#e07a5f", statuses: ["cancelled", "expired", "failed"] },
];
const STATUS_TEXT: Record<string, string> = { pending: "Scheduled", buying: "Paying now", bought: "Paying now", paid: "Paid", cancelled: "Cancelled", expired: "Not paid · no money moved", failed: "Not paid · no money moved" };
const TONE: Record<string, string> = { paid: "badge-good", buying: "badge-warn", bought: "badge-warn", expired: "badge-warn", failed: "badge-warn" };

export default function AppView() {
  const { address, isConnected, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [preset, setPreset] = useState<Preset>("payroll");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [dueDate, setDueDate] = useState("");
  const [repeat, setRepeat] = useState(1);
  const [quote, setQuote] = useState<{ usdtPerNaira: number; source: string; at: number } | null>(null);
  const [street, setStreet] = useState<Street | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => setMsg("Meet is offline right now. Try again in a minute."));
    fetch("/api/street").then((r) => r.json()).then(setStreet).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    const r = await fetch(`/api/obligations?owner=${address}`).then((x) => x.json()).catch(() => null);
    if (r?.items) setItems(r.items);
    publicClient.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [address] }).then(setBalance).catch(() => {});
  }, [address]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  // A live Textile rate (Uniswap if Textile has none), never a made-up number. Refreshes every 30 s.
  useEffect(() => {
    const load = () =>
      fetch("/api/quote?naira=1400")
        .then((r) => r.json())
        .then((q) => {
          const best = [q.textile, q.uniswap].filter(Boolean).map(BigInt).sort((a, b) => (a < b ? -1 : 1))[0];
          if (best) setQuote({ usdtPerNaira: Number(best) / 1e6 / 1400, source: q.textile ? "Textile" : "Uniswap", at: q.at });
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
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

  const rowsOk = rows.every((r) => isAddress(r.wallet) && BigInt(r.naira || "0") > 0n);
  const dateProblem = !dueDate ? `Choose a ${PRESETS[preset].dateName.toLowerCase()}.` : !quote ? "Loading today's rate…" : !plan ? "That date has passed. Payments are due at 5 pm on the day." : "";
  const total = plan?.reduce((s, o) => s + o.max, 0n) ?? 0n;
  const expected = plan?.reduce((s, o) => s + o.cost, 0n) ?? 0n;
  const totalNaira = plan?.reduce((s, o) => s + o.naira, 0n) ?? 0n;
  const overCap = !!cfg && !!plan?.some((o) => o.max > BigInt(cfg.maxObligationUsdt));
  const belowTextile = !!cfg && !!plan?.some((o) => o.naira * 1_000_000n < BigInt(cfg.textileMinCngn));

  function openSheet(p: Preset) {
    setPreset(p);
    setStep(0);
    setDone(false);
    setMsg("");
    setSheet(true);
  }

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
      const hash = await wallet.writeContract({ address: USDT, abi: erc20, functionName: "approve", args: [cfg.settlement, allowance + total], dataSuffix: TAG, chain: celo, account: address });
      setBusy("Confirming…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The approval didn't go through. Nothing was scheduled.");
      const signed = [];
      const base = BigInt(Date.now()) * 1000n;
      for (const [i, o] of plan.entries()) {
        setBusy(plan.length > 1 ? `Step 2 of 2: sign payment ${i + 1} of ${plan.length}…` : "Step 2 of 2: sign the payment (check your wallet)…");
        const message = { owner: address, recipient: o.recipient as `0x${string}`, sellToken: USDT, buyToken: CNGN, buyAmount: o.naira * 1_000_000n, maxSellAmount: o.max, validAfter: BigInt(o.validAfter), expiry: BigInt(o.due), nonce: base + BigInt(i) };
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
      setRows([emptyRow()]);
      setDueDate("");
      setDone(true);
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
      const hash = await wallet.writeContract({ address: cfg.settlement, abi: settlementAbi, functionName: "cancel", args: [BigInt(it.nonce)], dataSuffix: TAG, chain: celo, account: address });
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg(`Cancelled: ${it.label}. No money moved.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy("");
    }
  }

  // ---- derived dashboard numbers (only from this wallet's own payments)
  const list = items ?? [];
  const paidItems = list.filter((i) => i.status === "paid" && i.receipt);
  const deliveredNaira = paidItems.reduce((s, i) => s + Number(i.naira), 0);
  const day1 = paidItems.map((i) => savingOf(i.receipt!.vsDay1)).filter((x): x is number => x !== null);
  const streetS = paidItems.map((i) => savingOf(i.receipt!.vsStreet)).filter((x): x is number => x !== null);
  const reserved = list.filter((i) => ["pending", "buying", "bought"].includes(i.status)).reduce((s, i) => s + BigInt(i.maxSellAmount), 0n);
  const slices: Slice[] = GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.color, value: list.filter((i) => g.statuses.includes(i.status)).length }));
  const days = useMemo(() => Array.from({ length: 14 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() + k); return d; }), []);
  const dueOn = (d: Date) => list.filter((i) => ymd(new Date(Number(i.due) * 1000)) === ymd(d));
  const shown = list
    .filter((i) => {
      if (!filter) return true;
      if (filter.startsWith("day:")) return ymd(new Date(Number(i.due) * 1000)) === filter.slice(4);
      return GROUPS.find((g) => g.key === filter)?.statuses.includes(i.status) ?? true;
    })
    .sort((a, b) => Number(b.due) - Number(a.due));
  const rate = quote ? Math.round(1 / quote.usdtPerNaira) : null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (!isConnected) return <ConnectScreen cfg={cfg} msg={msg} />;
  if (chainId !== celo.id) {
    return (
      <section className="card max-w-xl mx-auto space-y-3 text-center reveal">
        <h1 className="section-title">One quick thing: switch to Celo</h1>
        <p className="muted">Your wallet is connected to this site on a different network. Meet runs on Celo.</p>
        <SwitchToCelo />
        <p className="hint">Or change the network for this site inside your wallet, or <SwitchWallet />.</p>
      </section>
    );
  }

  const P = PRESETS[preset];
  return (
    <>
      <section className="space-y-1 reveal">
        <h1 className="section-title">{greeting}</h1>
        <p className="muted">Here's what Meet is doing with your dollars and your bills.</p>
        {cfg && !cfg.live && <p className="badge badge-warn">Practice mode: payments are simulated and nothing is sent</p>}
      </section>

      {/* Headline tiles */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="card reveal lift space-y-2" style={{ background: "var(--ink)", color: "#fff", borderColor: "var(--ink)", animationDelay: "60ms" }}>
          <p className="text-sm opacity-70 flex items-center gap-2"><Icon name="wallet" size={16} /> Your dollars</p>
          <p className="stat">{balance === null ? "…" : <CountUp value={Number(balance) / 1e6} format={(n) => `$${n.toFixed(2)}`} />}</p>
          <p className="text-sm opacity-70">Stay in your wallet until a payee is paid. Meet never holds them.</p>
          {reserved > 0n && balance !== null && (
            <div className="space-y-1 pt-1">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Number((reserved * 100n) / (balance > 0n ? balance : 1n)))}%`, background: "var(--gold)", transition: "width 0.9s ease" }} />
              </div>
              <p className="text-xs opacity-70">Up to ${usd2(reserved)} may be used for your scheduled payments</p>
            </div>
          )}
        </div>
        <div className="card reveal lift space-y-2" style={{ animationDelay: "120ms" }}>
          <p className="muted text-sm flex items-center gap-2"><Icon name="check" size={16} /> Naira paid for you</p>
          <p className="stat">{items === null ? "…" : <CountUp value={deliveredNaira} format={(n) => naira(Math.round(n))} />}</p>
          <p className="muted text-sm">
            {items === null ? "Loading…" : `${paidItems.length} payment${paidItems.length === 1 ? "" : "s"} completed${list.length > paidItems.length ? `, ${list.length - paidItems.length} other` : ""}`}
          </p>
        </div>
        <div className="card reveal lift space-y-2" style={{ animationDelay: "180ms" }}>
          <p className="muted text-sm flex items-center gap-2"><span className="live-dot" /> Today's rate · live</p>
          <p className="stat">{rate ? <CountUp value={rate} format={(n) => naira(Math.round(n))} /> : "…"}</p>
          <p className="muted text-sm">
            per $1{quote ? ` on ${quote.source}` : ""}
            {street?.fresh && street.street ? ` · street ${naira(Math.round(street.street.nairaPerUsd))}` : ""}
          </p>
        </div>
      </section>

      {/* Proof of savings */}
      <section className="grid gap-4 sm:grid-cols-2">
        {[
          ["Versus the street rate", streetS, "reveal"],
          ["Versus converting on day one", day1, "reveal"],
        ].map(([title, vals, cls], i) => {
          const v = vals as number[];
          const sum = v.reduce((a, b) => a + b, 0);
          return (
            <div key={title as string} className={`card ${cls} flex items-center gap-4`} style={{ animationDelay: `${240 + i * 60}ms` }}>
              <span className="w-11 h-11 rounded-full grid place-items-center shrink-0" style={{ background: v.length && sum >= 0 ? "var(--good-bg)" : "var(--line)", color: v.length && sum >= 0 ? "var(--good)" : "var(--muted)" }}>
                <Icon name="trend" />
              </span>
              <div>
                <p className="muted text-sm">{title as string}</p>
                <p className="text-xl font-semibold">{v.length ? signedNaira(sum) : "No data yet"}</p>
                <p className="hint">{v.length ? `Across ${v.length} paid payment${v.length === 1 ? "" : "s"}` : "Your first receipt will show this."}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Start a payment */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Start a payment</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESETS) as Preset[]).map((p, i) => (
            <button key={p} onClick={() => openSheet(p)} className="card lift reveal text-left space-y-3 cursor-pointer" style={{ background: PRESETS[p].tint, animationDelay: `${300 + i * 60}ms` }}>
              <span className="w-11 h-11 rounded-full grid place-items-center" style={{ background: "var(--card)" }}>
                <Icon name={PRESETS[p].icon} />
              </span>
              <div>
                <p className="font-semibold text-lg">{PRESETS[p].title}</p>
                <p className="muted text-sm">{PRESETS[p].blurb}</p>
              </div>
              <p className="text-sm font-semibold flex items-center gap-1">Start <Icon name="arrow" size={16} /></p>
            </button>
          ))}
        </div>
      </section>

      {/* Chart + calendar */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card reveal space-y-3" style={{ animationDelay: "360ms" }}>
          <h2 className="font-semibold">Your payments</h2>
          {list.length === 0 ? (
            <p className="muted text-sm py-6 text-center">{items === null ? "Loading…" : "No payments yet. Start one above and it will show up here."}</p>
          ) : (
            <div className="flex items-center gap-5 flex-wrap justify-center sm:justify-start">
              <Donut slices={slices} active={filter && !filter.startsWith("day:") ? filter : null} onSelect={setFilter} centerLabel="payments" />
              <ul className="space-y-2 text-sm">
                {GROUPS.map((g) => (
                  <li key={g.key}>
                    <button className="flex items-center gap-2 cursor-pointer" onClick={() => setFilter(filter === g.key ? null : g.key)} style={{ fontWeight: filter === g.key ? 700 : 400 }}>
                      <i className="inline-block w-3 h-3 rounded-full" style={{ background: g.color }} />
                      {g.label} <span className="muted">· {slices.find((s) => s.key === g.key)?.value}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="card reveal space-y-3" style={{ animationDelay: "420ms" }}>
          <h2 className="font-semibold">Next 14 days</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d, k) => {
              const due = dueOn(d);
              const key = `day:${ymd(d)}`;
              return (
                <button key={key} className="dayCell shrink-0" aria-pressed={filter === key} onClick={() => setFilter(filter === key ? null : key)} title={due.length ? `${due.length} due` : "Nothing due"}>
                  <span className="block text-[11px] opacity-70">{k === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="block text-lg font-semibold">{d.getDate()}</span>
                  <span className="block h-2">
                    {due.length > 0 && <i className="inline-block w-2 h-2 rounded-full pop" style={{ background: due.some((x) => x.status === "paid") && due.every((x) => x.status === "paid") ? "var(--good)" : "var(--gold)" }} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="hint">Tap a day to see what's due. Gold means scheduled, green means paid.</p>
        </div>
      </section>

      {/* Activity */}
      <section className="space-y-3" id="payments">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-lg">Activity</h2>
          <div className="flex items-center gap-3 text-sm">
            {filter && (
              <button className="badge cursor-pointer" onClick={() => setFilter(null)}>
                Showing {filter.startsWith("day:") ? new Date(`${filter.slice(4)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : GROUPS.find((g) => g.key === filter)?.label} ✕
              </button>
            )}
            <span className="hint"><SwitchWallet /> · {short(address ?? "")}</span>
          </div>
        </div>
        {msg && !sheet && <p className="text-sm font-medium">{msg}</p>}
        {shown.length === 0 && <div className="card text-center muted">{items === null ? "Loading…" : list.length ? "Nothing matches that filter." : "No payments yet."}</div>}
        {shown.map((it) => {
          const isOpen = open === it.id;
          const clean = (t: string) => t.replace(/\s*\(.*\)\s*$/, "");
          return (
            <div key={it.id} className="card space-y-3 reveal lift">
              <button className="w-full flex items-start justify-between gap-3 text-left cursor-pointer" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen}>
                <div>
                  <p className="font-semibold">{it.label}</p>
                  <p className="muted text-sm">To {short(it.recipient)} · due {new Date(Number(it.due) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold">{naira(it.naira)}</p>
                  <span className={`badge ${TONE[it.status] ?? ""}`}>{STATUS_TEXT[it.status] ?? it.status}</span>
                </div>
              </button>
              {isOpen && (
                <div className="space-y-3 pop">
                  {!it.receipt && <p className="text-sm muted">{it.next}</p>}
                  {it.receipt && (
                    <div className="text-sm space-y-1 rounded-2xl p-3" style={{ background: "var(--good-bg)" }}>
                      <p>
                        <strong>Paid ${usd2(it.receipt.paidUsdt)}</strong> through {it.receipt.venue === "textile" ? "Textile" : "Uniswap"}.{" "}
                        {it.receipt.settleTx.startsWith("0x") ? <a className="underline" href={txLink(it.receipt.settleTx)} target="_blank" rel="noreferrer">View receipt on-chain</a> : "Practice payment, not on-chain."}
                      </p>
                      <p className="muted">Compared with converting on day one: {clean(it.receipt.vsDay1)}</p>
                      <p className="muted">Compared with the street rate: {clean(it.receipt.vsStreet)}</p>
                    </div>
                  )}
                  {it.status === "pending" && <button className="btn btn-ghost btn-sm btn-auto" disabled={!!busy} onClick={() => cancel(it)}>{busy || "Cancel this payment"}</button>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Payment sheet */}
      <Sheet open={sheet} onClose={() => !busy && setSheet(false)} title={P.title}>
        {done ? (
          <div className="text-center space-y-4 py-4 relative">
            <Confetti />
            <span className="w-16 h-16 rounded-full grid place-items-center mx-auto pop" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
              <Icon name="check" size={32} />
            </span>
            <h2 className="section-title">It's scheduled</h2>
            <p className="muted">Meet will pay on time and show your receipt here. Your dollars stay in your wallet until then, and you can cancel before it's paid.</p>
            <button className="btn" onClick={() => setSheet(false)}>See my payments</button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="muted text-sm">Step {step + 1} of 3</p>
                <h2 className="text-xl font-semibold">{step === 0 ? `${P.title}: who and how much?` : step === 1 ? `When should they be paid?` : "Check and confirm"}</h2>
              </div>
              <button className="chip" onClick={() => setSheet(false)} disabled={!!busy} aria-label="Close"><Icon name="close" size={16} /></button>
            </div>
            <div className="flex gap-2" aria-hidden>
              {[0, 1, 2].map((s) => (
                <i key={s} className="h-1.5 flex-1 rounded-full" style={{ background: s <= step ? "var(--ink)" : "var(--line)", transition: "background 0.3s" }} />
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-4">
                {rows.map((r, i) => (
                  <div key={i} className="space-y-3 pb-4 border-b" style={{ borderColor: "var(--line)" }}>
                    <div>
                      <label className="label">{P.rowName}</label>
                      <input className="field" placeholder="e.g. Ada" value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    </div>
                    <div>
                      <label className="label">Their wallet address</label>
                      <input className="field" placeholder="0x…" value={r.wallet} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, wallet: e.target.value.trim() } : x)))} />
                      {r.wallet && !isAddress(r.wallet) ? <p className="hint" style={{ color: "var(--warn)" }}>That doesn't look like a wallet address. It starts with 0x and is 42 characters long.</p> : <p className="hint">The Celo wallet that will receive the naira.</p>}
                    </div>
                    <div>
                      <label className="label">{P.amountName}</label>
                      <input className="field" inputMode="numeric" placeholder="e.g. 1400" value={r.naira} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, naira: e.target.value.replace(/\D/g, "") } : x)))} />
                      {quote && BigInt(r.naira || "0") > 0n && <p className="hint">About ${usd2(Math.ceil(Number(r.naira) * quote.usdtPerNaira * 1e6))} at today's rate</p>}
                    </div>
                  </div>
                ))}
                <button className="chip" onClick={() => setRows([...rows, emptyRow()])}><Icon name="plus" size={14} /> Add another person</button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="label">{P.dateName}</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[["Tomorrow", 1], ["In 3 days", 3], ["In a week", 7], ["In 2 weeks", 14]].map(([l, n]) => {
                      const d = new Date();
                      d.setDate(d.getDate() + (n as number));
                      return <button key={l as string} className="chip" aria-pressed={dueDate === ymd(d)} onClick={() => setDueDate(ymd(d))}>{l as string}</button>;
                    })}
                  </div>
                  <input type="date" className="field" min={ymd(new Date())} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  <p className="hint">Meet pays during the {WINDOW_DAYS} days before this date, at the best moment it finds. Payments are due at 5 pm.</p>
                </div>
                {P.repeat && (
                  <div>
                    <label className="label">Repeat every month for</label>
                    <select className="field" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                      {[1, 2, 3, 6].map((n) => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {step === 2 && plan && (
              <div className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {plan.map((o, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="muted">{o.label.replace(/^[^:]+: /, "")} · {new Date(o.due * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                      <strong>{naira(o.naira)}</strong>
                    </li>
                  ))}
                </ul>
                <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg)" }}>
                  <div className="flex justify-between"><span className="muted">They receive</span><strong className="text-lg">{naira(totalNaira)}</strong></div>
                  <div className="flex justify-between"><span className="muted">You pay about</span><strong className="text-lg">${usd2(expected)}</strong></div>
                  <div className="flex justify-between"><span className="muted">Never more than</span><strong>${usd2(total)}</strong></div>
                  <p className="hint">That's today's rate plus 3% protection. You usually pay less, and the receipt shows exactly what you paid.</p>
                </div>
                {overCap && <p className="badge badge-warn">Over the prototype limit of ${usd2(cfg!.maxObligationUsdt)} per payment. Go back and lower the amount.</p>}
                {belowTextile && !overCap && <p className="hint">Small payments under ₦1,378 are routed through Uniswap.</p>}
                <p className="hint">Your wallet will ask twice: once to allow this exact amount, once to sign the payment. Nothing is paid until the due window.</p>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-3 rounded-2xl p-4 text-white" style={{ background: "var(--ink)" }}>
                <span className="spinner" /> <span className="text-sm">{busy}</span>
              </div>
            )}
            {msg && !busy && <p className="text-sm font-medium" style={{ color: "var(--warn)" }}>{msg}</p>}

            {!busy && (
              <div className="flex gap-3">
                {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
                {step < 2 ? (
                  <button className="btn" disabled={step === 0 ? !rowsOk : !!dateProblem} onClick={() => setStep(step + 1)}>
                    Next
                  </button>
                ) : (
                  <button className="btn" disabled={!plan || overCap || !wallet} onClick={submit}>Confirm and sign</button>
                )}
              </div>
            )}
            {!busy && step === 0 && !rowsOk && <p className="hint text-center">Fill in each person's wallet address and amount to continue.</p>}
            {!busy && step === 1 && dateProblem && <p className="hint text-center">{dateProblem}</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}

function ConnectScreen({ cfg, msg }: { cfg: AgentConfig | null; msg: string }) {
  return (
    <section className="card max-w-xl mx-auto space-y-4 text-center reveal">
      <h1 className="section-title">Connect your wallet to start</h1>
      <p className="muted">Use a Celo wallet such as MiniPay. You'll need a few dollars of USD₮ in it. Meet never holds your money: it stays in your wallet until your payee is paid.</p>
      <div className="text-left">
        <WalletPicker />
      </div>
      {cfg && !cfg.live && <p className="badge badge-warn">Practice mode: payments are simulated</p>}
      {msg && <p className="text-sm">{msg}</p>}
      <p className="hint">New to Meet? <a className="underline" href="/">Read the story</a> or <a className="underline" href="/try">see what you need</a>.</p>
    </section>
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
      <button className="btn" disabled={isPending} onClick={() => mutate({ chainId: celo.id })}>{isPending ? "Check your wallet…" : "Switch to Celo"}</button>
      {error && <p style={{ color: "var(--warn)" }}>{error.message.split("\n")[0]}</p>}
    </div>
  );
}

function SwitchWallet() {
  const { mutate } = useDisconnect();
  const inMiniPay = typeof window !== "undefined" && (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay;
  if (inMiniPay) return <span>MiniPay</span>;
  return <button className="underline" onClick={() => mutate()}>switch wallet</button>;
}
