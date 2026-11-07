// Paid calls made by hand through the buy CLI while wiring each service, outside the agent's loop and ledger.
// Each payment is on-chain from the buy wallet 0x134e…A018 to the gateway (checked 2026-11-07).
export const PAID_BY_HAND = [
  { day: "2026-11-06", service: "x.posts.search", usdt: 5_000n, tx: "0xabc1479292edf6b2f3445f2ba864d00f24464b80cd5fc5879f90711e832986bc", ok: true },
  { day: "2026-11-06", service: "x.posts.search", usdt: 5_000n, tx: "0xd92b50c77f0a5ed1232d3524f5b5a8dc98c8aacc3b1381477243d6dbbf3b293a", ok: true },
  { day: "2026-11-06", service: "cencori.v1.chat.completions", usdt: 10_000n, tx: "0xce8b943c6e6ccad542c4d45c0b8d06307a78d6d0089f6035f01f6b42e78b7806", ok: false },
  { day: "2026-11-07", service: "reddit.posts.search", usdt: 5_000n, tx: "0x4f613704a6c8ec0c9c65660daaf7852729d91354eb67ffbe8e69d9a8c0496694", ok: true },
] as const;
