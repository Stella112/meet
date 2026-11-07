"use client";

import { useEffect, useState } from "react";
import { naira } from "@/lib/chain";

type Stats = { payments: { paid: number; deliveredCngn: string; paidUsdt: string; byVenue: Record<string, number> }; live: boolean };
type Quote = { rate: number; source: string };

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can Meet take my money?",
    a: "No. You allow Meet to use only the exact amount for the payments you schedule, and you sign each payment yourself. The contract can only pay the person you named, never more than your worst case, and only before the due date. You can cancel any time before it's paid.",
  },
  {
    q: "What does it cost?",
    a: "A 0.1% fee, taken inside the amount you approved. Before you confirm, you see an \"about\" price and a \"never more than\" price. After it's paid, the receipt shows what you paid and how that compares with converting on day one and with the street rate.",
  },
  {
    q: "What if Meet can't pay on time?",
    a: "Then the payment is marked \"Not paid\" and no money moves from your wallet. Meet buys the naira first with its own money, so the risk of a bad rate sits with Meet, not with you.",
  },
  {
    q: "What do I need to try it?",
    a: "A Celo wallet such as MiniPay, and a few dollars of USD₮ in it. The person you pay needs a Celo wallet that can hold cNGN, a naira stablecoin they can cash out to a bank.",
  },
  {
    q: "Is this a bank or a licensed service?",
    a: "No. It's a hackathon prototype on Celo with small limits (about $1.10 per payment right now). A regulatory review is needed before a real launch.",
  },
];

const Cta = ({ children = "Try it now" }: { children?: string }) => (
  <a href="/app" className="btn btn-auto">
    {children} →
  </a>
);

export default function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    // MiniPay users open the app directly: it needs to connect on load.
    if ((window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay) {
      window.location.replace("/app");
      return;
    }
    fetch("/api/dashboard").then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/quote?naira=1400")
      .then((r) => r.json())
      .then((q) => {
        const best = [q.textile, q.uniswap].filter(Boolean).map(BigInt).sort((a, b) => (a < b ? -1 : 1))[0];
        if (best) setQuote({ rate: Math.round(1400 / (Number(best) / 1e6)), source: q.textile ? "Textile" : "Uniswap" });
      })
      .catch(() => {});
  }, []);

  const delivered = stats ? Number(stats.payments.deliveredCngn) / 1e6 : 0;

  return (
    <>
      {/* 1. The promise */}
      <section className="text-center max-w-3xl mx-auto pt-8 space-y-6">
        <span className="badge">Built on Celo</span>
        <h1 className="hero-title">Earn in dollars. Pay your naira bills on time.</h1>
        <p className="text-lg muted max-w-xl mx-auto">
          Keep your money in dollars. Meet buys the naira your staff, suppliers and bills need just before they're due, pays them, and shows you what it cost.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Cta />
          <a href="#problem" className="btn btn-auto btn-ghost">Read the story</a>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm muted">
          <li>✓ Your dollars stay in your wallet</li>
          <li>✓ Cancel any time before it's paid</li>
          <li>✓ Every payment is on-chain</li>
        </ul>
      </section>

      {/* 2. Live numbers */}
      <section className="grid gap-4 sm:grid-cols-3 text-center">
        <div className="card space-y-1">
          <p className="muted text-sm">Naira paid out so far</p>
          <p className="stat">{stats ? naira(Math.round(delivered)) : "…"}</p>
        </div>
        <div className="card space-y-1">
          <p className="muted text-sm">Real payments made</p>
          <p className="stat">{stats ? stats.payments.paid : "…"}</p>
        </div>
        <div className="card space-y-1">
          <p className="muted text-sm">Today's rate</p>
          <p className="stat">{quote ? naira(quote.rate) : "…"}</p>
          <p className="hint">per $1{quote ? `, live from ${quote.source}` : ""}</p>
        </div>
      </section>

      {/* 3. The problem */}
      <section id="problem" className="max-w-3xl mx-auto space-y-4 scroll-mt-6 pt-4">
        <p className="badge">The problem</p>
        <h2 className="section-title">If you earn in dollars, most of your life is still priced in naira.</h2>
        <p className="text-lg muted leading-relaxed">
          Rent, school fees, staff salaries and supplier invoices are all due in naira. So most people convert on payday, whatever the rate is that day. Along the way
          they lose value, pay the street spread, or risk a P2P trade going wrong.
        </p>
        <p className="text-lg muted leading-relaxed">
          Waiting for a better moment is a full-time job. Nobody has time to watch the rate, and a bill that's late is worse than a rate that's slightly off.
        </p>
      </section>

      {/* 4. The idea */}
      <section className="max-w-3xl mx-auto space-y-4">
        <p className="badge">The idea</p>
        <h2 className="section-title">Tell Meet once. It handles the timing.</h2>
        <p className="text-lg muted leading-relaxed">
          You keep your money in dollars, in your own wallet. For each bill you tell Meet who to pay, how much in naira, and by when. Meet watches the market in the days
          before the due date, picks a good moment and the cheaper of two places to buy, and pays your payee on time. Then it shows you a receipt with what it cost.
        </p>
      </section>

      {/* 5. How it works */}
      <section id="how" className="space-y-6 scroll-mt-6">
        <h2 className="section-title text-center">How it works, step by step</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Tell Meet who to pay", "Pick staff, a supplier or a bill. Add their wallet, the amount in naira and the date."],
            ["Approve once", "You allow only the exact amount for this payment, and sign it yourself. Your dollars don't move yet."],
            ["Meet picks the moment", "In the 3 days before the due date, Meet watches the rate and buys the naira at a good moment, within your rate limit."],
            ["They're paid. You get proof.", "Your payee receives naira in their wallet. You get a receipt that compares what you paid with the street rate and with converting on day one."],
          ].map(([t, d], i) => (
            <div key={t} className="card space-y-3">
              <span className="step-num">{i + 1}</span>
              <h3 className="font-semibold text-lg">{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Who it's for */}
      <section className="space-y-6">
        <h2 className="section-title text-center">Who it's for</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Pay staff", "Small businesses and freelancers who pay salaries in naira but are paid in dollars."],
            ["Pay a supplier", "Anyone with invoices due in naira by a fixed date."],
            ["Pay a bill", "Rent, power or school fees, set up once and repeated every month."],
          ].map(([t, d]) => (
            <div key={t} className="card space-y-2">
              <h3 className="font-semibold text-lg">{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. Safety */}
      <section className="max-w-3xl mx-auto space-y-4">
        <p className="badge">Your money stays yours</p>
        <h2 className="section-title">Built so Meet can't run off with your dollars.</h2>
        <ul className="space-y-3 text-lg muted leading-relaxed">
          <li>
            <strong className="text-[color:var(--ink)]">Your dollars stay in your wallet</strong> until your payee is paid. Meet never holds them.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">One exact amount.</strong> You approve only what a payment needs, never an unlimited allowance.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">A worst-case price you set.</strong> You always see "about $X, never more than $Y". The contract refuses anything above it.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Meet carries the risk.</strong> It buys the naira first with its own money. If it can't pay, nothing leaves your wallet.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Cancel any time</strong> before it's paid, straight from your wallet.
          </li>
        </ul>
        <p className="muted">
          These limits are enforced by a smart contract on Celo, not just by the app, and we've tested that they hold.{" "}
          <a className="underline" href="https://github.com/Stella112/meet/blob/main/docs/demo/failed-limit-2026-11-07.txt" target="_blank" rel="noreferrer">See the test</a>.
        </p>
      </section>

      {/* 8. Under the hood */}
      <section className="max-w-3xl mx-auto space-y-4">
        <p className="badge">Under the hood</p>
        <h2 className="section-title">An agent with strict rules, not a guess.</h2>
        <p className="text-lg muted leading-relaxed">
          Meet is an AI agent, but every money decision is made by fixed code you can read. It buys the naira early when the rate beats the one at signing by 0.5% or
          more, when bad news about the naira shows up, or when the due date gets close. It compares Textile and Uniswap on Celo and uses the cheaper one. News comes
          from a paid search of X and Reddit that it pays for itself, and it has hard limits on how much it can spend or hold, plus a kill switch.
        </p>
        <p className="text-lg muted leading-relaxed">
          The agent has its own on-chain identity (ERC-8004, agent 10044), and every transaction it sends carries the same tag, so you can check what it did.
        </p>
      </section>

      {/* 9. Proof */}
      <section className="card max-w-3xl mx-auto w-full space-y-4">
        <p className="badge badge-good">Proof, not promises</p>
        <h2 className="section-title">Real payments, on a public ledger.</h2>
        <p className="muted text-lg leading-relaxed">
          Meet is live on Celo mainnet. {stats ? `So far it has made ${stats.payments.paid} real payments and delivered ${naira(Math.round(delivered))} to payees.` : ""} Every payment links to
          its transaction, and the ledger shows how each one compares with the street rate and with converting on day one, including when Meet did worse.
        </p>
        <a href="/dashboard" className="btn btn-auto btn-ghost">See the ledger</a>
      </section>

      {/* 10. Where we are */}
      <section className="max-w-3xl mx-auto space-y-4">
        <p className="badge badge-warn">Honest status</p>
        <h2 className="section-title">This is a prototype, built for a hackathon.</h2>
        <p className="text-lg muted leading-relaxed">
          Meet was built for the Agents on Open Rails hackathon on Celo. It has small limits (about $1.10 per payment right now) and it isn't a licensed money service.
          A regulatory review is needed before a real launch. What you see here is real, working, and public, but it's an early version.
        </p>
      </section>

      {/* 11. Try it */}
      <section className="card text-center max-w-2xl mx-auto w-full space-y-4">
        <h2 className="section-title">Want to see it work?</h2>
        <p className="muted text-lg">Pay one small bill from about a dollar and watch the receipt appear.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Cta />
          <a href="/try" className="btn btn-auto btn-ghost">What do I need?</a>
        </div>
      </section>

      {/* 12. FAQ */}
      <section id="faq" className="max-w-2xl mx-auto w-full space-y-2 scroll-mt-6">
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
