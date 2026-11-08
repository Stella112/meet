import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import data from "./data.json";

// All figures below come from the live ledger, on-chain reads, or logged quotes. Nothing is invented.
export const FPS = 30;
const PAD = 10;
type Sentence = { start: number; end: number; text: string };
type Name = "hook" | "tell" | "how" | "pay" | "trust" | "stack" | "proof" | "close";
const ORDER: Name[] = ["hook", "tell", "how", "pay", "trust", "stack", "proof", "close"];
const scenes = ORDER.map((name) => ({ name, frames: Math.ceil((data.durations as Record<Name, number>)[name] * FPS) + PAD }));
export const totalFrames = scenes.reduce((s, x) => s + x.frames, 0);

const C = { bg: "#f3f0e8", card: "#fffdf8", ink: "#1a1a18", muted: "#6b6a62", line: "#e2ddd0", good: "#1e6b4a", goodBg: "#e3f1e9", warn: "#9a5b00", warnBg: "#fbefd9", gold: "#a67c37", bad: "#b3261e" };
const font = 'Inter, "Segoe UI", system-ui, sans-serif';

const useIn = (delay = 0, damping = 16) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.7 } });
};

const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const p = useIn(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 34}px)`, ...style }}>{children}</div>;
};

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.card, border: `2px solid ${C.line}`, borderRadius: 28, padding: 32, boxShadow: "0 18px 50px rgba(26,26,24,.08)", ...style }}>{children}</div>
);

const Title: React.FC<{ kicker: string; children: React.ReactNode }> = ({ kicker, children }) => (
  <div style={{ position: "absolute", left: 100, top: 62, right: 100 }}>
    <Rise><div style={{ color: C.gold, fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>{kicker}</div></Rise>
    <Rise delay={4}><div style={{ fontSize: 66, fontWeight: 650, letterSpacing: -2, marginTop: 8, lineHeight: 1.08 }}>{children}</div></Rise>
  </div>
);

const Browser: React.FC<{ src: string; imgH: number; url: string; w: number; h: number; panTo: number; frames: number; style?: React.CSSProperties; zoom?: number }> = ({ src, imgH, url, w, h, panTo, frames, style, zoom = 1 }) => {
  const f = useCurrentFrame();
  const scale = (w / 1440) * zoom;
  const y = interpolate(f, [20, frames - 15], [0, -panTo * scale], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: w, borderRadius: 20, overflow: "hidden", border: `2px solid ${C.line}`, background: "#fff", boxShadow: "0 30px 80px rgba(26,26,24,.18)", ...style }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "#ece8dd" }}>
        {["#d9786b", "#dcb462", "#7fb77f"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 9, background: c }} />)}
        <span style={{ marginLeft: 14, background: "#fff", borderRadius: 8, padding: "3px 16px", fontSize: 19, color: C.muted }}>{url}</span>
      </div>
      <div style={{ height: h, overflow: "hidden" }}>
        <Img src={staticFile(src)} style={{ width: 1440 * scale, height: imgH * scale, transform: `translate(${(w - 1440 * scale) / 2}px, ${y}px)`, display: "block" }} />
      </div>
    </div>
  );
};

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: size * 0.48, height: size * 0.48, background: C.ink }} />
      <div style={{ position: "absolute", right: 0, bottom: 0, width: size * 0.48, height: size * 0.48, background: C.ink }} />
    </div>
    <span style={{ fontSize: size * 1.05, fontWeight: 650, letterSpacing: -size * 0.03 }}>Meet</span>
  </div>
);

const LiveBadge: React.FC = () => {
  const f = useCurrentFrame();
  const glow = 6 + 10 * Math.abs(Math.sin(f / 12));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14, background: C.goodBg, color: C.good, borderRadius: 99, padding: "12px 30px", fontSize: 36, fontWeight: 650 }}>
      <span style={{ width: 16, height: 16, borderRadius: 9, background: C.good, boxShadow: `0 0 ${glow}px ${C.good}` }} /> Live on Celo mainnet
    </div>
  );
};

const sent = (n: Name) => (data.timing as Record<Name, Sentence[]>)[n];
const startOf = (n: Name, needle: string) => Math.round((sent(n).find((s) => s.text.includes(needle))?.start ?? 0) * FPS);

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const payday = startOf("hook", "So on payday");
  const pain = startOf("hook", "You pay the street");
  const what = startOf("hook", "What if");
  const meet = startOf("hook", "This is Meet");
  const flip = interpolate(f, [12, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chips: [string, number][] = [["Street spread", pain + 8], ["P2P scam risk", pain + 50], ["Naira moves before rent", pain + 92]];
  const show = (a: number, b: number) => (f >= a && f < b ? interpolate(f, [a, a + 8, b - 6, b], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: show(0, payday), alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 96, fontWeight: 650, letterSpacing: -3 }}>Paid in <span style={{ color: C.good }}>dollars.</span></div>
        <div style={{ fontSize: 96, fontWeight: 650, letterSpacing: -3, opacity: f > 60 ? 1 : 0 }}>Bills in <span style={{ color: C.gold }}>naira.</span></div>
        <div style={{ display: "flex", gap: 60, marginTop: 56 }}>
          <div style={{ fontSize: 170, fontWeight: 700, color: C.good, transform: `scale(${0.8 + flip * 0.2})` }}>$</div>
          <div style={{ fontSize: 170, color: C.muted }}>→</div>
          <div style={{ fontSize: 170, fontWeight: 700, color: C.gold, opacity: flip }}>₦</div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: show(payday, what), alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 88, fontWeight: 650, letterSpacing: -3, marginBottom: 56 }}>Convert it all on payday, and…</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, alignItems: "center" }}>
          {chips.map(([t, d]) => {
            const p = spring({ frame: f - d, fps: FPS, config: { damping: 11 } });
            return <div key={t} style={{ transform: `scale(${p})`, opacity: p, background: C.warnBg, color: C.warn, fontSize: 62, fontWeight: 650, padding: "16px 54px", borderRadius: 99 }}>{t}</div>;
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: show(what, meet), alignItems: "center", justifyContent: "center", padding: 130, textAlign: "center" }}>
        <div style={{ fontSize: 84, fontWeight: 650, letterSpacing: -3, lineHeight: 1.15 }}>An agent that holds your dollars until each bill is due, then pays it.</div>
        <div style={{ fontSize: 60, color: C.good, fontWeight: 650, marginTop: 44 }}>And can never take more than you signed.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: f >= meet ? 1 : 0, alignItems: "center", justifyContent: "center", gap: 56 }}>
        <div style={{ transform: `scale(${spring({ frame: f - meet, fps: FPS, config: { damping: 12 } })})` }}><Logo size={170} /></div>
        <Rise delay={meet + 22}><LiveBadge /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Tell: React.FC<{ frames: number }> = ({ frames }) => {
  const presets = [["Payroll", "Your staff, one payday"], ["Suppliers", "Each invoice, on its date"], ["Bills", "Rent and utilities, monthly"]];
  return (
    <AbsoluteFill>
      <Title kicker="Live product">Tell it once.</Title>
      <Rise delay={8} style={{ position: "absolute", left: 100, top: 250 }}>
        <Browser src="landing.png" imgH={5200} url="usemeet.website" w={980} h={620} panTo={2600} frames={frames} />
      </Rise>
      <div style={{ position: "absolute", right: 100, top: 250, width: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        {presets.map(([a, b], i) => (
          <Rise key={a} delay={120 + i * 22}><Card style={{ padding: "22px 30px" }}><div style={{ fontSize: 42, fontWeight: 650 }}>{a}</div><div style={{ fontSize: 30, color: C.muted }}>{b}</div></Card></Rise>
        ))}
        <Rise delay={330}><Card style={{ background: C.goodBg, borderColor: C.goodBg, padding: "22px 30px" }}><div style={{ fontSize: 34, fontWeight: 650, color: C.good }}>Approve the worst case only. One signature per payment. Dollars stay in your wallet.</div></Card></Rise>
      </div>
    </AbsoluteFill>
  );
};

const How: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  const x = interpolate(f, [30, frames - 30], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rules: [string, string, string, number][] = [
    ["Naira shock on X and Reddit", "Paid news check through buy", "Convert now", startOf("how", "If both")],
    ["Rate beats day 1 by 0.5%", "Compared every batch", "Convert sooner", startOf("how", "If the rate")],
    ["12 hours before due", "The default", "Convert", startOf("how", "Otherwise")],
  ];
  return (
    <AbsoluteFill>
      <Title kicker="How it decides">Waits for the right moment.</Title>
      <div style={{ position: "absolute", left: 120, right: 120, top: 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: C.muted, marginBottom: 16 }}><span>Window opens: 3 days before</span><span>Due date</span></div>
        <div style={{ height: 18, background: C.line, borderRadius: 9, position: "relative" }}>
          <div style={{ width: `${x}%`, height: "100%", background: C.ink, borderRadius: 9 }} />
          <div style={{ position: "absolute", left: "83%", top: -12, width: 4, height: 42, background: C.gold }} />
          <div style={{ position: "absolute", left: `calc(${x}% - 22px)`, top: -13, width: 44, height: 44, borderRadius: 22, background: C.good, color: "#fff", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>$</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 430, display: "flex", gap: 30 }}>
        {rules.map(([a, b, c, d]) => (
          <Rise key={a} delay={d} style={{ flex: 1 }}><Card style={{ height: 300 }}><div style={{ fontSize: 42, fontWeight: 650, lineHeight: 1.15 }}>{a}</div><div style={{ fontSize: 28, color: C.muted, marginTop: 12 }}>{b}</div><div style={{ fontSize: 34, color: C.good, fontWeight: 700, marginTop: 20 }}>→ {c}</div></Card></Rise>
        ))}
      </div>
      <Rise delay={startOf("how", "Rules in code")} style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", fontSize: 46, fontWeight: 650 }}>Rules in code decide. Not a language model.</Rise>
    </AbsoluteFill>
  );
};

const Pay: React.FC = () => {
  const f = useCurrentFrame();
  const atomic = startOf("pay", "Then one transaction");
  const flow = interpolate(f, [atomic + 10, atomic + 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const nodes: [string, string][] = [["Your wallet", "USD₮"], ["MeetSettlement", "one transaction"], ["Your payee", "cNGN"]];
  return (
    <AbsoluteFill>
      <Title kicker="How it pays">Cheapest venue. One transaction.</Title>
      <div style={{ position: "absolute", left: 120, right: 120, top: 270, display: "flex", gap: 30 }}>
        {[["Textile FX", "1.017378"], ["Uniswap v3", "1.017374"]].map(([a, b], i) => (
          <Rise key={a} delay={10 + i * 16} style={{ flex: 1 }}><Card><div style={{ fontSize: 36, color: C.muted }}>{a}</div><div style={{ fontSize: 66, fontWeight: 650 }}>{b} USD₮</div><div style={{ fontSize: 26, color: C.muted }}>for ₦1,400 · logged live quote</div></Card></Rise>
        ))}
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 590, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {nodes.map(([a, b], i) => (
          <React.Fragment key={a}>
            <Rise delay={atomic + i * 8}><Card style={{ width: 400, textAlign: "center" }}><div style={{ fontSize: 40, fontWeight: 650 }}>{a}</div><div style={{ fontSize: 30, color: i === 1 ? C.gold : C.good, fontWeight: 650 }}>{b}</div></Card></Rise>
            {i < 2 && <div style={{ opacity: f > atomic + 8 ? 1 : 0, flex: 1, height: 8, background: C.line, margin: "0 16px", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", background: C.good, width: `${Math.min(1, flow * 2 - i) * 100}%` }} /></div>}
          </React.Fragment>
        ))}
      </div>
      <Rise delay={atomic + 90} style={{ position: "absolute", left: 0, right: 0, top: 830, textAlign: "center", fontSize: 44, fontWeight: 650, color: C.good }}>Paid in full, or nothing moves.</Rise>
    </AbsoluteFill>
  );
};

const Trust: React.FC = () => {
  const f = useCurrentFrame();
  const attack = startOf("trust", "We tried");
  const cancel = startOf("trust", "You can cancel");
  const stamp = spring({ frame: f - attack - 45, fps: FPS, config: { damping: 9 } });
  const fields = [["Payee gets exactly", "₦1,400"], ["Most you pay", "$1.0479"], ["Paid to", "one signed payee"], ["Deadline", "signed expiry"]];
  const rest = ["Cancel any time before it pays", "Can't pay? Meet sells its naira back. No funds moved.", "Hard caps · stop-loss · kill switch"];
  return (
    <AbsoluteFill>
      <Title kicker="Why you can trust it">Your signature is the limit.</Title>
      <Rise delay={8} style={{ position: "absolute", left: 100, top: 260, width: 760 }}>
        <Card style={{ position: "relative" }}>
          <div style={{ fontSize: 30, color: C.muted, marginBottom: 16 }}>Signed obligation</div>
          {fields.map(([a, b]) => <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 38, padding: "13px 0", borderTop: `1px solid ${C.line}` }}><span style={{ color: C.muted }}>{a}</span><b>{b}</b></div>)}
          <div style={{ opacity: f > attack ? 1 : 0, marginTop: 18, fontSize: 36, color: C.bad, fontWeight: 650 }}>Agent tries: max + 0.000001</div>
          <div style={{ position: "absolute", right: 26, top: 14, transform: `rotate(-7deg) scale(${stamp})`, opacity: stamp, border: `6px solid ${C.bad}`, color: C.bad, borderRadius: 14, fontSize: 44, fontWeight: 800, padding: "2px 20px", background: C.card }}>REFUSED</div>
        </Card>
      </Rise>
      <div style={{ position: "absolute", right: 100, top: 260, width: 830, display: "flex", flexDirection: "column", gap: 24 }}>
        {rest.map((t, i) => <Rise key={t} delay={cancel + i * 75}><Card style={{ fontSize: 42, fontWeight: 620, lineHeight: 1.18 }}>{t}</Card></Rise>)}
      </div>
    </AbsoluteFill>
  );
};

const Stack: React.FC = () => {
  const items = [["Textile FX", "Firm RFQ taker, filled on Celo"], ["Uniswap v3", "Fallback, compared every time"], ["buy", "Paid X and Reddit search"], ["x402", "Paid live rate board for agents"], ["ERC-8004", "On-chain identity · agent 10044"], ["ERC-8021", "Tag on every Meet transaction"]];
  return (
    <AbsoluteFill>
      <Title kicker="Integrations">Built on open rails.</Title>
      <div style={{ position: "absolute", left: 100, right: 100, top: 260, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
        {items.map(([a, b], i) => <Rise key={a} delay={14 + i * 62}><Card style={{ height: 260 }}><div style={{ fontSize: 58, fontWeight: 680, letterSpacing: -1 }}>{a}</div><div style={{ fontSize: 34, color: C.muted, marginTop: 14, lineHeight: 1.2 }}>{b}</div></Card></Rise>)}
      </div>
    </AbsoluteFill>
  );
};

const Proof: React.FC<{ frames: number }> = ({ frames }) => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [20, 80], [0, 2700], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const stats = [["Textile", "1 payment"], ["Uniswap", "2 payments"], ["Vs day 1", "₦2.72 worse"]];
  return (
    <AbsoluteFill>
      <Title kicker="Public proof">Measured, never promised.</Title>
      <Rise delay={8} style={{ position: "absolute", left: 100, top: 250 }}>
        <Browser src="dashboard.png" imgH={2300} url="usemeet.website/dashboard" w={1020} h={620} panTo={640} frames={frames} zoom={1.4} />
      </Rise>
      <div style={{ position: "absolute", right: 100, top: 250, width: 600, display: "flex", flexDirection: "column", gap: 18 }}>
        <Card><div style={{ fontSize: 28, color: C.muted }}>Delivered in test payments</div><div style={{ fontSize: 92, fontWeight: 680, letterSpacing: -3 }}>₦{n.toLocaleString("en-NG")}</div><div style={{ fontSize: 26, color: C.muted }}>Between the builder's own wallets</div></Card>
        {stats.map(([a, b], i) => <Rise key={a} delay={110 + i * 40}><Card style={{ padding: "18px 30px", display: "flex", justifyContent: "space-between", fontSize: 36 }}><span style={{ color: C.muted }}>{a}</span><b style={{ color: i === 2 ? C.warn : C.ink }}>{b}</b></Card></Rise>)}
      </div>
    </AbsoluteFill>
  );
};

const Close: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, textAlign: "center" }}>
    <Rise><Logo size={130} /></Rise>
    <Rise delay={70}><div style={{ fontSize: 76, fontWeight: 650, letterSpacing: -2, maxWidth: 1500, lineHeight: 1.12 }}>Dollars until you need naira. Then paid, on time, on-chain.</div></Rise>
    <Rise delay={200}><div style={{ fontSize: 62, fontWeight: 700, color: C.good }}>usemeet.website</div></Rise>
    <Rise delay={230}><div style={{ fontSize: 30, color: C.muted }}>github.com/Stella112/meet · Capped hackathon prototype, not a licensed money service</div></Rise>
  </AbsoluteFill>
);

const Captions: React.FC<{ name: Name }> = ({ name }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const s = sent(name).find((x) => t >= x.start && t < x.end + 0.15);
  if (!s) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 1560, background: "rgba(26,26,24,.86)", color: "#fff", fontSize: 31, lineHeight: 1.28, padding: "10px 26px", borderRadius: 12, textAlign: "center" }}>{s.text}</div>
    </div>
  );
};

const Shell: React.FC<{ name: Name; frames: number; children: React.ReactNode }> = ({ name, frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: name === "hook" ? interpolate(f, [frames - 8, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : o }}>
      {children}
      <Captions name={name} />
    </AbsoluteFill>
  );
};

export const MeetDemo: React.FC = () => {
  const f = useCurrentFrame();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.ink, fontFamily: font }}>
      {scenes.map(({ name, frames }) => {
        const start = from;
        from += frames;
        return (
          <Sequence key={name} from={start} durationInFrames={frames}>
            <Audio src={staticFile(`vo/${name}.mp3`)} />
            <Shell name={name} frames={frames}>
              {name === "hook" && <Hook />}
              {name === "tell" && <Tell frames={frames} />}
              {name === "how" && <How frames={frames} />}
              {name === "pay" && <Pay />}
              {name === "trust" && <Trust />}
              {name === "stack" && <Stack />}
              {name === "proof" && <Proof frames={frames} />}
              {name === "close" && <Close />}
            </Shell>
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, background: C.gold, width: `${(f / totalFrames) * 100}%` }} />
    </AbsoluteFill>
  );
};
