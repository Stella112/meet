"use client";

import { useEffect, useState } from "react";
import { naira, short, txLink, usd } from "@/lib/chain";

type Sum = { totalCngn: string; counted: number; missing: number };
type Dashboard = {
  live: boolean;
  at: number;
  payments: { paid: number; byStatus: Record<string, number>; deliveredCngn: string; paidUsdt: string; nairaPerUsd: number | null; byVenue: Record<string, number>; byRule: Record<string, number> };
  savings: { vsDay1: Sum; vsStreet: Sum };
  services: {
    calls: number;
    failed: number;
    spentUsdt: string;
    recent: { day: string; service: string; usdt: string; tx: string | null; ok: boolean }[];
    byHand?: { day: string; service: string; usdt: string; tx: string; ok: boolean }[];
  };
  news: { value: string; at: number } | null;
  street: { nairaPerUsd: number; source: string; at: number; fresh: boolean } | null;
  recent: { at: number; venue: string; rule: string; paidUsdt: string; deliveredCngn: string; savedDay1Cngn: string | null; savedStreetCngn: string | null; buyTx: string; settleTx: string }[];
};

const RULES: Record<string, string> = { buffer_reached: "Due soon", early_edge: "Beat day-1 rate", news_shock: "News shock", retry: "Retried" };
const VENUES: Record<string, string> = { textile: "Textile", uniswap: "Uniswap" };
const ngn = (atomic: string) => Number(atomic) / 1e6;
const fmtNgn = (atomic: string) => naira(Math.round(ngn(atomic)));

/** Signed naira with the direction in words, so it never relies on color. */
function saving(atomic: string | null): string {
  if (atomic === null) return "no data";
  const n = ngn(atomic);
  const abs = Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n >= 0 ? `₦${abs} better` : `₦${abs} worse`;
}

function TxLink({ hash }: { hash: string }) {
  return hash.startsWith("0x") ? (
    <a className="underline" href={txLink(hash)} target="_blank" rel="noreferrer">
      {short(hash)}
    </a>
  ) : (
    <span className="muted">dry-run</span>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card space-y-1">
      <p className="text-xs muted">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="text-xs muted">{note}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then((j) => {
          setD(j);
          setErr("");
        })
        .catch(() => setErr("Agent is offline."));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const open = d ? (d.payments.byStatus.pending ?? 0) + (d.payments.byStatus.bought ?? 0) + (d.payments.byStatus.buying ?? 0) : 0;
  const notPaid = d ? (d.payments.byStatus.expired ?? 0) + (d.payments.byStatus.failed ?? 0) + (d.payments.byStatus.cancelled ?? 0) : 0;

  return (
    <>
      <header className="space-y-1">
        <h1 className="section-title">Proof: every payment Meet has made</h1>
        <p className="muted text-sm">What each one cost and how it compares. Totals only: no payee names or wallets are shown. Every row links to the payment on-chain.</p>
        {d && !d.live && <p className="text-xs" style={{ color: "var(--warn)" }}>This agent is in dry-run: the figures below are simulated, nothing was sent on-chain.</p>}
        {err && <p className="text-sm">{err}</p>}
      </header>

      {d && (
        <>
          <section className="card space-y-1">
            <p className="text-sm muted">Naira paid out</p>
            <p className="font-semibold" style={{ fontSize: 48, lineHeight: 1.1 }}>
              {fmtNgn(d.payments.deliveredCngn)}
            </p>
            <p className="text-sm muted">
              {d.payments.paid} payment{d.payments.paid === 1 ? "" : "s"} · {usd(d.payments.paidUsdt)} USD₮ paid
              {d.payments.nairaPerUsd ? ` · ${naira(Math.round(d.payments.nairaPerUsd))} per $1 after fees` : ""}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Tile
              label="Vs locking the rate on day 1"
              value={d.savings.vsDay1.counted ? saving(d.savings.vsDay1.totalCngn) : "no data"}
              note={`${d.savings.vsDay1.counted} of ${d.payments.paid} payments`}
            />
            <Tile
              label="Vs the street rate"
              value={d.savings.vsStreet.counted ? saving(d.savings.vsStreet.totalCngn) : "no data"}
              note={d.savings.vsStreet.missing ? `${d.savings.vsStreet.missing} without a same-day street rate` : `${d.savings.vsStreet.counted} payments`}
            />
            <Tile label="Scheduled, not yet paid" value={String(open)} note={notPaid ? `${notPaid} closed unpaid, no funds moved` : "none closed unpaid"} />
            <Tile
              label="Paid services"
              value={`$${(Number(d.services.spentUsdt) / 1e6).toFixed(3)}`}
              note={`${d.services.calls} call${d.services.calls === 1 ? "" : "s"}${d.services.failed ? `, ${d.services.failed} failed (counted as maybe paid)` : ""}`}
            />
          </section>

          <section className="card text-sm space-y-1">
            <p>
              Venues:{" "}
              {Object.keys(d.payments.byVenue).length
                ? Object.entries(d.payments.byVenue).map(([k, n]) => `${VENUES[k] ?? k} ${n}`).join(" · ")
                : "none yet"}
            </p>
            <p>
              Why it converted:{" "}
              {Object.keys(d.payments.byRule).length ? Object.entries(d.payments.byRule).map(([k, n]) => `${RULES[k] ?? k} ${n}`).join(" · ") : "none yet"}
            </p>
            <p className="muted">
              News: {d.news ? `${d.news.value} (${new Date(d.news.at * 1000).toLocaleString()})` : "not checked"} · Street rate:{" "}
              {d.street ? `${naira(Math.round(d.street.nairaPerUsd))} per $1${d.street.fresh ? "" : ", too old to use"}` : "not entered"}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Recent payments</h2>
            {d.recent.length === 0 ? (
              <p className="muted text-sm">No payments yet.</p>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr className="text-left muted text-xs">
                      <th className="p-2 font-normal">When</th>
                      <th className="p-2 font-normal">Delivered</th>
                      <th className="p-2 font-normal">Paid</th>
                      <th className="p-2 font-normal">Vs day 1</th>
                      <th className="p-2 font-normal">Vs street</th>
                      <th className="p-2 font-normal">Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent.map((r) => (
                      <tr key={r.settleTx} className="border-t" style={{ borderColor: "var(--line)" }}>
                        <td className="p-2 whitespace-nowrap">
                          {new Date(r.at * 1000).toLocaleDateString()}
                          <div className="text-xs muted">
                            {VENUES[r.venue] ?? r.venue} · {RULES[r.rule] ?? r.rule}
                          </div>
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{fmtNgn(r.deliveredCngn)}</td>
                        <td className="p-2 text-right whitespace-nowrap">${usd(r.paidUsdt)}</td>
                        <td className="p-2 whitespace-nowrap">{saving(r.savedDay1Cngn)}</td>
                        <td className="p-2 whitespace-nowrap">{saving(r.savedStreetCngn)}</td>
                        <td className="p-2 whitespace-nowrap text-xs">
                          buy <TxLink hash={r.buyTx} />
                          <br />
                          pay <TxLink hash={r.settleTx} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {d.services.recent.length > 0 && (
            <section className="space-y-1 text-sm">
              <h2 className="font-semibold">Recent paid service calls</h2>
              {d.services.recent.map((c, i) => (
                <p key={i} className="muted">
                  {c.day} · {c.service} · ${(Number(c.usdt) / 1e6).toFixed(3)} · {c.ok ? "ok" : "failed"} {c.tx && <TxLink hash={c.tx} />}
                </p>
              ))}
            </section>
          )}

          {!!d.services.byHand?.length && (
            <section className="space-y-1 text-sm">
              <h2 className="font-semibold">Paid calls made by hand while wiring services</h2>
              <p className="muted text-xs">Outside the agent's loop, so not in the totals above. Each is a real payment from the buy wallet.</p>
              {d.services.byHand.map((c) => (
                <p key={c.tx} className="muted">
                  {c.day} · {c.service} · ${(Number(c.usdt) / 1e6).toFixed(3)} · {c.ok ? "ok" : "paid, then failed"} <TxLink hash={c.tx} />
                </p>
              ))}
            </section>
          )}

          <p className="text-xs muted">Updated {new Date(d.at * 1000).toLocaleTimeString()} · refreshes every 30 s</p>
        </>
      )}
      <p className="text-sm">
        <a className="underline" href="/">Back to Meet</a>
      </p>
    </>
  );
}
