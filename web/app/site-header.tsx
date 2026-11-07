"use client";

import { useConnection } from "wagmi";
import { short } from "@/lib/chain";

const LINKS = [
  { href: "/", label: "Pay" },
  { href: "/dashboard", label: "Proof" },
  { href: "/try", label: "Try it" },
];

export function SiteHeader() {
  const { address, isConnected } = useConnection();
  return (
    <>
      <div className="text-center text-xs sm:text-sm text-white py-2 px-4" style={{ background: "var(--gold)" }}>
        Live on Celo. Pay naira bills from your dollars, and see exactly what it cost. <a className="underline font-semibold" href="/dashboard">See the proof →</a>
      </div>
      <header className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2 font-semibold text-lg" aria-label="Meet home">
          <span aria-hidden className="inline-grid grid-cols-2 gap-[2px]">
            <i className="block w-2.5 h-2.5" style={{ background: "var(--ink)" }} />
            <i className="block w-2.5 h-2.5" />
            <i className="block w-2.5 h-2.5" />
            <i className="block w-2.5 h-2.5" style={{ background: "var(--ink)" }} />
          </span>
          Meet
        </a>
        <nav className="hidden sm:flex items-center gap-6 text-sm">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </a>
          ))}
        </nav>
        {isConnected && address ? (
          <span className="badge badge-good" title={address}>
            ● {short(address)}
          </span>
        ) : (
          <a className="btn btn-auto btn-sm" href="/#connect">
            Connect wallet
          </a>
        )}
      </header>
      <nav className="sm:hidden flex justify-center gap-6 text-sm pb-2">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="underline">
            {l.label}
          </a>
        ))}
      </nav>
    </>
  );
}
