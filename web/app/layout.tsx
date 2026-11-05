import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Meet",
  description: "Pays your naira bills on time from your dollars, with proof of what it saved.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <main className="mx-auto max-w-xl px-4 py-5 space-y-4">{children}</main>
          <footer className="mx-auto max-w-xl px-4 pb-8 text-xs muted space-y-2">
            <p>Your dollars stay in your wallet until your payee is paid. Meet buys naira early with its own money and bears that risk.</p>
            <p>Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.</p>
            <p>
              Cash out cNGN to a bank:{" "}
              <a className="underline" href="https://blog.textilecredit.com/blog/textile-noblocks-naira-ramp" target="_blank" rel="noreferrer">
                Textile × Noblocks ramp
              </a>{" "}
              (external; its route settles on BNB Chain, not Celo).
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
