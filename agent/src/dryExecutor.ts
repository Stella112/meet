import type { Executor } from "./engine.js";
import type { Lot, StoredObligation, Venue, VenueQuote } from "./types.js";

/** Signs nothing and broadcasts nothing. Hashes are labelled so they can't pass as real. */
export class DryRunExecutor implements Executor {
  private n = 0;
  failNextSettles = 0;
  actions: string[] = [];

  constructor(private clock: () => number) {}

  async buy(quote: VenueQuote, cngn: bigint): Promise<Lot> {
    this.actions.push(`WOULD buy ${cngn} cNGN on ${quote.venue} for ${quote.usdtIn} USDT`);
    return { cngn, usdtCost: quote.usdtIn, venue: quote.venue, boughtAt: this.clock(), txHash: `dry-run-${++this.n}` };
  }

  async settle(o: StoredObligation, sellAmount: bigint): Promise<string> {
    if (this.failNextSettles > 0) {
      this.failNextSettles--;
      throw new Error("simulated settle revert");
    }
    this.actions.push(`WOULD settle ${o.id}: owner pays ${sellAmount} USDT, ${o.o.recipient} gets ${o.o.buyAmount} cNGN`);
    return `dry-run-${++this.n}`;
  }

  async unwind(lot: Lot, venue: Venue): Promise<string> {
    this.actions.push(`WOULD sell ${lot.cngn} cNGN on ${venue}`);
    return `dry-run-${++this.n}`;
  }
}
