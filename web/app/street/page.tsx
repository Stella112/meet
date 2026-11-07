"use client";

import { useEffect, useState } from "react";
import { naira } from "@/lib/chain";

type Street = { street: null | { nairaPerUsd: number; source: string; at: number }; fresh: boolean; maxAgeHours: number; entryEnabled: boolean };

// Owner page for the daily manual street rate. The token lives only in this browser.
export default function StreetPage() {
  const [current, setCurrent] = useState<Street | null>(null);
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/street").then((r) => r.json()).then(setCurrent).catch(() => setMsg("Agent is offline."));
  useEffect(() => {
    load();
    try {
      setToken(localStorage.getItem("meet-street-token") ?? "");
      setSource(localStorage.getItem("meet-street-source") ?? "");
    } catch {}
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/street", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify({ rate, source }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      try {
        localStorage.setItem("meet-street-token", token.trim());
        localStorage.setItem("meet-street-source", source);
      } catch {}
      setRate("");
      setMsg(`Saved ${naira(Math.round(j.saved.nairaPerUsd))} per $1.`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = current?.street;
  return (
    <>
      <header className="space-y-1">
        <h1 className="section-title">Street rate (owner only)</h1>
        <p className="muted text-sm">
          Enter it once a day: the naira you'd get for $1 selling dollars on the street (a BDC's buy price). Receipts compare each payment against it. After{" "}
          {current?.maxAgeHours ?? 30} hours without an entry they show "no data" rather than an old rate.
        </p>
      </header>

      <section className="card text-sm space-y-1">
        {s ? (
          <>
            <p>
              Latest: <strong>{naira(Math.round(s.nairaPerUsd))}</strong> per $1 · {s.source.replace(/^manual: /, "")}
            </p>
            <p className="muted">
              {new Date(s.at * 1000).toLocaleString()} · {current?.fresh ? "in use" : "too old, receipts show no data"}
            </p>
          </>
        ) : (
          <p className="muted">No street rate entered yet.</p>
        )}
      </section>

      {current && !current.entryEnabled ? (
        <p className="text-sm muted">Entry is off: the agent has no STREET_TOKEN set.</p>
      ) : (
        <section className="card space-y-3">
          <label className="block text-sm">
            Naira per $1
            <input className="field mt-1" inputMode="decimal" placeholder="e.g. 1395" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
          <label className="block text-sm">
            Where you got it
            <input className="field mt-1" placeholder="e.g. BDC, Wuse Abuja" maxLength={80} value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label className="block text-sm">
            Owner token
            <input className="field mt-1" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <button className="btn" disabled={busy || !rate || source.trim().length < 2 || token.trim().length < 16} onClick={save}>
            {busy ? "Saving…" : "Save today's rate"}
          </button>
          {msg && <p className="text-sm">{msg}</p>}
        </section>
      )}
      <p className="text-sm">
        <a className="underline" href="/">Back to Meet</a>
      </p>
    </>
  );
}
