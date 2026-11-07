"use client";

import { usePathname } from "next/navigation";
import { useConnection } from "wagmi";
import { short } from "@/lib/chain";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/dashboard", label: "Proof" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const { address, isConnected } = useConnection();
  const inApp = usePathname() === "/app";
  return (
    <>
      <div className="text-center text-xs sm:text-sm text-white py-2 px-4" style={{ background: "var(--gold)" }}>
        Live on Celo mainnet. Real payments, public proof. <a className="underline font-semibold" href="/dashboard">See the ledger →</a>
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
        ) : inApp ? (
          <span />
        ) : (
          <a className="btn btn-auto btn-sm" href="/app">
            Try it now
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
