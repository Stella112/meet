import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "./site-header";

export const metadata: Metadata = {
  title: "Meet: pay naira bills from your dollars",
  description: "Keep your money in dollars. Meet pays your naira bills on time, at the best moment, and shows you proof of what it cost.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 space-y-8">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-12 text-sm muted space-y-3 border-t" style={{ borderColor: "var(--line)" }}>
            <p className="pt-6">
              Your dollars stay in your wallet until your payee is paid. Meet buys the naira early with its own money and carries that risk.
            </p>
            <p>This is a hackathon prototype, not a licensed money service. A regulatory review is needed before launch.</p>
            <p className="flex flex-wrap gap-x-5 gap-y-1">
              <a className="underline" href="/dashboard">Proof: every payment</a>
              <a className="underline" href="/try">Try it</a>
              <a className="underline" href="https://github.com/Stella112/meet" target="_blank" rel="noreferrer">Source code</a>
              <a className="underline" href="https://blog.textilecredit.com/blog/textile-noblocks-naira-ramp" target="_blank" rel="noreferrer">
                Cash out naira to a bank (external)
              </a>
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
