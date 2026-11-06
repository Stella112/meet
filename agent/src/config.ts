import { z } from "zod";

const usd = (d: string) => z.coerce.number().positive().default(Number(d)).transform((n) => BigInt(Math.round(n * 1e6)));
const int = (d: number) => z.coerce.number().int().nonnegative().default(d);
const flag = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? d : v === "true"));

const schema = z.object({
  DRY_RUN: flag(true),
  LIVE_ACK: z.string().optional().default(""),
  PAUSED: flag(false),
  MAX_OBLIGATION_USD: usd("25"),
  MAX_DAILY_SERVICE_SPEND_USD: usd("2"),
  MAX_AGENT_CNGN_EXPOSURE_USD: usd("100"),
  MAX_HEDGE_SLIPPAGE_BPS: int(50),
  MAX_HOLD_MINUTES: int(30),
  MAX_INVENTORY_LOSS_BPS: int(150),
  CONVERT_BUFFER_HOURS: int(12),
  EARLY_EDGE_BPS: int(50),
  NEWS_TTL_MIN: int(120),
  PROTOCOL_FEE_BPS: int(10),
  BATCH_SECONDS: int(60),
  STREET_MAX_AGE_HOURS: int(30),
  CELO_RPC_URL: z.string().default("https://forno.celo.org"),
});

export type Config = z.output<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return schema.parse(env);
}

/** A mainnet tx may be sent only when both flags are set. */
export function isLive(cfg: Pick<Config, "DRY_RUN" | "LIVE_ACK">): boolean {
  return cfg.DRY_RUN === false && cfg.LIVE_ACK === "i-understand-real-money";
}
