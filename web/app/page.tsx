"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useConnect, useConnection, useDisconnect, useWalletClient } from "wagmi";
import { celo } from "wagmi/chains";
import { CNGN, erc20, naira, obligationTypes, publicClient, settlementAbi, short, TAG, txLink, USDT, usd } from "@/lib/chain";

type Preset = "payroll" | "supplier" | "bills";
type Row = { label: string; wallet: string; naira: string };
type Street = { street: null | { nairaPerUsd: number; source: string; at: number }; fresh: boolean };
type AgentConfig = { settlement: `0x${string}`; maxObligationUsdt: string; bufferHours: number; live: boolean; textileMinCngn: string };
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

const PRESETS: Record<Preset, { title: string; rowName: string; amountName: string; dateName: string; repeat: boolean }> = {
  payroll: { title: "Payroll", rowName: "Staff name", amountName: "Salary (₦)", dateName: "Payday", repeat: false },
  supplier: { title: "Supplier", rowName: "Supplier / invoice", amountName: "Invoice (₦)", dateName: "Due date", repeat: false },
  bills: { title: "Bills", rowName: "Bill (rent, power…)", amountName: "Amount (₦)", dateName: "Due date", repeat: true },
};
const TOLERANCE_BPS = 300n;
const WINDOW_DAYS = 3;

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
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => setMsg("Agent is offline."));
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

  useEffect(() => {
    fetch("/api/street").then((r) => r.json()).then(setStreet).catch(() => {});
  }, []);

  const plan = useMemo(() => {
    if (!quote || !dueDate || !address) return null;
    const firstDue = Math.floor(new Date(`${dueDate}T17:00:00`).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const out: { label: string; recipient: string; naira: bigint; max: bigint; validAfter: number; due: number }[] = [];
    for (let m = 0; m < (PRESETS[preset].repeat ? repeat : 1); m++) {
      const d = new Date(firstDue * 1000);
      d.setMonth(d.getMonth() + m);
      const due = Math.floor(d.getTime() / 1000);
      for (const r of rows) {
        const n = BigInt(r.naira || "0");
        if (n <= 0n || !isAddress(r.wallet)) return null;
        const cost = BigInt(Math.ceil(Number(n) * quote.usdtPerNaira * 1e6));
        const label = `${PRESETS[preset].title}: ${r.label || short(r.wallet)}${m ? ` (month ${m + 1})` : ""}`;
        out.push({ label, recipient: r.wallet, naira: n, max: (cost * (10_000n + TOLERANCE_BPS)) / 10_000n, validAfter: Math.max(now - 60, due - WINDOW_DAYS * 86400), due });
      }
    }
    return out.some((o) => o.due <= now) ? null : out;
  }, [quote, dueDate, address, rows, preset, repeat]);

  const total = plan?.reduce((s, o) => s + o.max, 0n) ?? 0n;
  const overCap = !!cfg && !!plan?.some((o) => o.max > BigInt(cfg.maxObligationUsdt));
  const belowTextile = !!cfg && !!plan?.some((o) => o.naira * 1_000_000n < BigInt(cfg.textileMinCngn));

  async function submit() {
    if (!plan || !wallet || !address || !cfg) return;
    setMsg("");
    try {
      setBusy("Checking your USD₮…");
      const [bal, allowance] = await Promise.all([
        publicClient.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [address] }),
        publicClient.readContract({ address: USDT, abi: erc20, functionName: "allowance", args: [address, cfg.settlement] }),
      ]);
      if (bal < total) throw new Error(`You need ${usd(total)} USD₮ for the worst case; you have ${usd(bal)}.`);
      setBusy("Approve in your wallet (exact amount, not unlimited)…");
      const hash = await wallet.writeContract({
        address: USDT,
        abi: erc20,
        functionName: "approve",
        args: [cfg.settlement, allowance + total],
        dataSuffix: TAG,
        chain: celo,
        account: address,
      });
      setBusy("Waiting for the approval…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Approval failed.");
      const signed = [];
      const base = BigInt(Date.now()) * 1000n;
      for (const [i, o] of plan.entries()) {
        setBusy(`Sign payment ${i + 1} of ${plan.length}…`);
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
      setBusy("Sending to Meet…");
      const r = await fetch("/api/obligations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: signed }) }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setMsg(`Plan saved: ${r.saved.length} payment(s).`);
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
      setBusy("Cancel in your wallet…");
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
      setMsg(`Cancelled ${it.label}.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy("");
    }
  }

  const P = PRESETS[preset];
  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Meet</h1>
        <p className="muted text-sm">Keep your money in dollars. Meet buys the naira your bills need just before they're due, and pays them.</p>
        {cfg && !cfg.live && <p className="text-xs" style={{ color: "var(--warn)" }}>Agent is in dry-run: payments are simulated, nothing is sent.</p>}
      </header>

      {!isConnected ? (
        <WalletPicker />
      ) : chainId !== celo.id ? (
        <div className="card text-sm space-y-2">
          <p>Switch your wallet to Celo.</p>
          <SwitchWallet />
        </div>
      ) : (
        <>
          <p className="text-xs muted">
            Connected {short(address ?? "")} · <SwitchWallet />
          </p>
          <section className="card space-y-3">
            <div className="flex gap-2">
              {(Object.keys(PRESETS) as Preset[]).map((p) => (
                <button key={p} className="chip" aria-pressed={p === preset} onClick={() => setPreset(p)}>
                  {PRESETS[p].title}
                </button>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={i} className="space-y-2 border-b pb-3" style={{ borderColor: "var(--line)" }}>
                <input className="field" placeholder={P.rowName} value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="field" placeholder="Payee Celo wallet 0x…" value={r.wallet} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, wallet: e.target.value.trim() } : x)))} />
                <input className="field" inputMode="numeric" placeholder={P.amountName} value={r.naira} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, naira: e.target.value.replace(/\D/g, "") } : x)))} />
              </div>
            ))}
            <button className="chip" onClick={() => setRows([...rows, { label: "", wallet: "", naira: "" }])}>+ Add another</button>
            <label className="block text-sm">
              {P.dateName}
              <input type="date" className="field mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            {P.repeat && (
              <label className="block text-sm">
                Repeat monthly for
                <select className="field mt-1" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                  {[1, 2, 3, 6].map((n) => (
                    <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="text-sm space-y-1">
              {quote ? (
                <p>
                  Today's rate: {naira(Math.round(1 / quote.usdtPerNaira))} per $1 ({quote.source}, {new Date(quote.at * 1000).toLocaleTimeString()})
                </p>
              ) : (
                <p className="muted">Today's rate: no data</p>
              )}
              {street?.fresh && street.street ? (
                <p className="muted">
                  Street rate: {naira(Math.round(street.street.nairaPerUsd))} per $1 ({street.street.source.replace(/^manual: /, "")}, entered {new Date(street.street.at * 1000).toLocaleString()})
                </p>
              ) : (
                <p className="muted">Street rate: not entered today, so receipts show "vs street: no data".</p>
              )}
              {plan && (
                <>
                  <p>Worst case you could pay: {usd(total)} USD₮ (today's rate + 3%). You usually pay less.</p>
                  <p className="muted">Each payment converts in the {WINDOW_DAYS} days before it's due, at the best moment Meet finds.</p>
                </>
              )}
              {overCap && <p style={{ color: "var(--warn)" }}>Prototype limit: {usd(cfg!.maxObligationUsdt)} USD₮ per payment.</p>}
              {belowTextile && !overCap && <p className="muted">Under ₦1,378 a payment can only use Uniswap (Textile's minimum).</p>}
            </div>
            <button className="btn" disabled={!plan || overCap || !!busy || !wallet} onClick={submit}>
              {busy || `Approve and sign ${plan?.length ?? ""} payment${plan && plan.length > 1 ? "s" : ""}`}
            </button>
            {msg && <p className="text-sm">{msg}</p>}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Your calendar</h2>
            {items.length === 0 && <p className="muted text-sm">No payments yet.</p>}
            {items.map((it) => (
              <div key={it.id} className="card text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <strong>{it.label}</strong>
                  <span>{naira(it.naira)}</span>
                </div>
                <p className="muted">
                  Due {new Date(Number(it.due) * 1000).toLocaleString()} · to {short(it.recipient)} · {it.status}
                </p>
                <p>{it.next}</p>
                {it.receipt && (
                  <div className="space-y-1 pt-1">
                    <p>
                      Paid {usd(it.receipt.paidUsdt)} USD₮ via {it.receipt.venue === "textile" ? "Textile" : "Uniswap"} ·{" "}
                      {it.receipt.settleTx.startsWith("0x") ? (
                        <a className="underline" href={txLink(it.receipt.settleTx)} target="_blank" rel="noreferrer">receipt</a>
                      ) : (
                        "dry-run, not on chain"
                      )}
                    </p>
                    <p>vs street: {it.receipt.vsStreet}</p>
                    <p>vs converting on day 1: {it.receipt.vsDay1}</p>
                  </div>
                )}
                {it.status === "pending" && (
                  <button className="chip" disabled={!!busy} onClick={() => cancel(it)}>Cancel</button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function WalletPicker() {
  const { mutate, connectors, isPending, error } = useConnect();
  const inMiniPay = typeof window !== "undefined" && (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay;
  if (inMiniPay) return <div className="card text-sm">Connecting to MiniPay…</div>;
  // Named wallets found by EIP-6963 first; the generic "Injected" entry only when nothing else was announced.
  const named = connectors.filter((c) => c.id !== "injected");
  const list = named.length ? named : connectors;
  return (
    <div className="card text-sm space-y-2">
      <p>Choose a wallet on the Celo network.</p>
      {list.length === 0 && <p className="muted">No wallet found. Open Meet inside MiniPay or a wallet app's browser.</p>}
      {list.map((c) => (
        <button key={c.uid} className="chip w-full text-left flex items-center gap-2" disabled={isPending} onClick={() => mutate({ connector: c })}>
          {c.icon && <img src={c.icon} alt="" width={20} height={20} />}
          {c.name}
        </button>
      ))}
      {error && <p style={{ color: "var(--warn)" }}>{error.message.split("\n")[0]}</p>}
    </div>
  );
}

function SwitchWallet() {
  const { mutate } = useDisconnect();
  const inMiniPay = typeof window !== "undefined" && (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay;
  if (inMiniPay) return null;
  return (
    <button className="underline" onClick={() => mutate()}>
      switch wallet
    </button>
  );
}
