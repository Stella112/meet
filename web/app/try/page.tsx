"use client";

import { useState } from "react";

type Check = { rule: string; ok: boolean | null; detail: string };
type Result = { verdict: string; meetPayments: number; checks: Check[] };

const RULE_TEXT: Record<string, string> = {
  "not yours": "Not one of Meet's own wallets",
  "not first funded by you": "Not first funded by Meet's builder",
  "own Celo activity before start": "Used Celo before the hackathon started (6 Oct)",
};

// Recruiting page: what trying Meet takes, and a self-check against the hackathon's independent-user rule.
export default function TryPage() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setMsg("");
    setResult(null);
    try {
      const r = await fetch(`/api/eligibility?address=${encodeURIComponent(address.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Try Meet</h1>
        <p className="muted text-sm">
          Pay one naira bill from your dollars and see the receipt. Meet is a hackathon prototype on Celo, capped at about $1.10 per payment, so a test costs about
          a dollar.
        </p>
      </header>

      <section className="card text-sm space-y-2">
        <h2 className="font-semibold">What you need</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>A Celo wallet: MiniPay, or a browser wallet switched to Celo.</li>
          <li>About $1.10 of USD₮ on Celo. MiniPay pays gas in stablecoin; other wallets need a little CELO.</li>
          <li>A payee wallet that can hold cNGN (naira). It can be a friend's, or your own second wallet.</li>
        </ul>
      </section>

      <section className="card text-sm space-y-2">
        <h2 className="font-semibold">How to try it</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open <a className="underline" href="/">usemeet.website</a> in your wallet and connect.
          </li>
          <li>Pick Bills, enter the payee wallet, ₦1,400 and today's date.</li>
          <li>Approve the exact amount and sign. Your dollars stay in your wallet until the payee is paid.</li>
          <li>Within a couple of minutes it shows Paid, with a receipt and what it saved.</li>
        </ol>
        <p className="muted">Changed your mind? Press Cancel before it's paid; no funds move.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-sm">Do you count as an independent user?</h2>
        <p className="muted text-xs">
          The hackathon counts wallets that aren't the builder's, weren't first funded by the builder, and used Celo before it started. New to Celo? You're still
          welcome; you just won't count toward this one rule.
        </p>
        <input className="field" placeholder="Your Celo wallet 0x…" value={address} onChange={(e) => setAddress(e.target.value.trim())} />
        <button className="btn" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(address)} onClick={check}>
          {busy ? "Reading Celo (up to a minute)…" : "Check my wallet"}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
        {result && (
          <div className="text-sm space-y-1">
            <p>
              <strong>
                {result.verdict === "eligible" ? "You count as an independent user." : result.verdict === "not eligible" ? "You don't count as an independent user." : "We couldn't decide automatically."}
              </strong>
            </p>
            {result.checks.map((c) => (
              <p key={c.rule}>
                {c.ok === true ? "✓" : c.ok === false ? "✗" : "?"} {RULE_TEXT[c.rule] ?? c.rule}
                <span className="muted"> · {c.detail}</span>
              </p>
            ))}
            <p className="muted">Payments you've made through Meet: {result.meetPayments}</p>
          </div>
        )}
        <p className="muted text-xs">Reads public Celo data only. Nothing is stored except a 10-minute cache.</p>
      </section>

      <p className="text-sm">
        <a className="underline" href="/">Back to Meet</a> · <a className="underline" href="/dashboard">Ledger</a>
      </p>
    </>
  );
}
