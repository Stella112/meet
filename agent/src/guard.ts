import type { Config } from "./config.js";

export type GuardBlock = "paused" | "obligation_cap" | "exposure_cap";

/** Exposure is measured in the USDT paid for cNGN currently held. */
export function canBuy(
  cfg: Pick<Config, "PAUSED" | "MAX_OBLIGATION_USD" | "MAX_AGENT_CNGN_EXPOSURE_USD">,
  cost: bigint,
  heldCost: bigint,
): GuardBlock | null {
  if (cfg.PAUSED) return "paused";
  if (cost > cfg.MAX_OBLIGATION_USD) return "obligation_cap";
  if (heldCost + cost > cfg.MAX_AGENT_CNGN_EXPOSURE_USD) return "exposure_cap";
  return null;
}

export function canSpend(cfg: Pick<Config, "PAUSED" | "MAX_DAILY_SERVICE_SPEND_USD">, spentToday: bigint, price: bigint): boolean {
  return !cfg.PAUSED && spentToday + price <= cfg.MAX_DAILY_SERVICE_SPEND_USD;
}

export function holdExceeded(boughtAt: number, now: number, maxHoldMinutes: number): boolean {
  return now - boughtAt > maxHoldMinutes * 60;
}

/** True when selling the lot now would lose more than the limit. */
export function stopLossHit(usdtCost: bigint, sellBackUsdt: bigint, maxLossBps: number): boolean {
  return (usdtCost - sellBackUsdt) * 10_000n > usdtCost * BigInt(maxLossBps);
}
