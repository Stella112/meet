"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up (or down) to its value. */
export function CountUp({ value, format, ms = 900 }: { value: number; format: (n: number) => string; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(shown)}</>;
}

export type Slice = { key: string; label: string; value: number; color: string };

/** Clickable donut: segments grow in on load, the centre shows the hovered or selected slice. */
export function Donut({ slices, active, onSelect, centerLabel }: { slices: Slice[]; active: string | null; onSelect: (key: string | null) => void; centerLabel: string }) {
  const [grown, setGrown] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 70;
  const C = 2 * Math.PI * r;
  const gap = total > slices.filter((s) => s.value > 0).length ? 4 : 0;
  let offset = 0;
  const focus = slices.find((s) => s.key === (hover ?? active));
  return (
    <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0" role="img" aria-label={`${centerLabel}: ${slices.map((s) => `${s.value} ${s.label}`).join(", ")}`}>
      <circle cx="90" cy="90" r={r} fill="none" stroke="var(--line)" strokeWidth="22" />
      {total > 0 &&
        slices.map((s) => {
          if (s.value <= 0) return null;
          const len = Math.max(0, (s.value / total) * C - gap);
          const el = (
            <circle
              key={s.key}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={active === s.key || hover === s.key ? 28 : 22}
              strokeDasharray={grown ? `${len} ${C - len}` : `0 ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 90 90)"
              style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.2,0.7,0.2,1), stroke-width 0.15s", cursor: "pointer", opacity: active && active !== s.key ? 0.35 : 1 }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(active === s.key ? null : s.key)}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
          offset += (s.value / total) * C;
          return el;
        })}
      <text x="90" y="86" textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--ink)">
        {focus ? focus.value : total}
      </text>
      <text x="90" y="108" textAnchor="middle" fontSize="12" fill="var(--muted)">
        {focus ? focus.label : centerLabel}
      </text>
    </svg>
  );
}

/** Sheet: a bottom sheet on phones, a centred card on desktop. Esc and the backdrop close it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </div>
    </>
  );
}

const COLORS = ["#1e6b4a", "#a67c37", "#1a1a18", "#e07a5f", "#7aa6c2", "#d4b483"];
/** Pieces fall once when mounted. Positions are fixed so it renders the same on server and client. */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <i
          key={i}
          style={
            {
              background: COLORS[i % COLORS.length],
              "--x": `${((i * 37) % 260) - 130}px`,
              "--r": `${(i * 53) % 540}deg`,
              animationDelay: `${(i % 7) * 60}ms`,
              animationDuration: `${1.3 + (i % 5) * 0.15}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

type IconName = "staff" | "supplier" | "bill" | "wallet" | "check" | "close" | "plus" | "clock" | "trend" | "arrow";
const PATHS: Record<IconName, ReactNode> = {
  staff: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  supplier: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  bill: (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10M10 20v-6h4v6" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13v4" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z" />
      <circle cx="16.5" cy="14.5" r="1" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trend: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
