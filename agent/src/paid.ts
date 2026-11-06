import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// One x402 call through the @celo/buy CLI, paid from a named account whose key stays in the OS keychain.
// Exactly one attempt: the CLI never re-pays, and neither does this. A failure after payment is "maybe paid".
const require = createRequire(import.meta.url);
const BUY_CLI = join(dirname(require.resolve("@celo/buy/package.json")), "dist", "main.js");

export interface PaidResult {
  ok: boolean;
  /** Payment tx from the gateway envelope, or null if none was reported. */
  tx: string | null;
  body: unknown;
}

export function buyCall(url: string, body: unknown, opts: { account: string; token?: "USDT" | "USDC"; maxUsd: string; timeoutMs?: number }): Promise<PaidResult> {
  const args = [BUY_CLI, "--json", "--account", opts.account, "curl", "--token", opts.token ?? "USDT", "--max-amount", opts.maxUsd, "--data-file", "-", "-s", "-X", "POST", "-H", "content-type: application/json", url];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), opts.timeoutMs ?? 90_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        return reject(new Error(`buy exited ${code}; ${err.slice(0, 300) || out.slice(0, 300)}`));
      }
      const tx = typeof (parsed as { transaction?: unknown })?.transaction === "string" ? (parsed as { transaction: string }).transaction : null;
      // The CLI exits 0 even when the paid request ends in 4xx/5xx; it says so in a JSON warning on stderr.
      const warned = err.split("\n").some((line) => {
        try {
          const status = JSON.parse(line)?.warning?.details?.status;
          return typeof status === "number" && status >= 400;
        } catch {
          return false;
        }
      });
      const errorBody = typeof parsed === "object" && parsed !== null && "error" in parsed;
      resolve({ ok: code === 0 && !warned && !errorBody, tx, body: parsed });
    });
    child.stdin.end(JSON.stringify(body));
  });
}
