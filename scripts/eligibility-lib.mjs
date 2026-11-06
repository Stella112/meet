// Pure rules for the independent-user check. No network here, so it can be tested.

export const lower = (a) => String(a ?? "").toLowerCase();

/** rows: normalized transfers { from, to, at (unix s), value (string, atomic), what, hash }. Earliest incoming value wins. */
export function firstFunding(address, rows) {
  const a = lower(address);
  return (
    rows
      .filter((r) => lower(r.to) === a && BigInt(r.value || "0") > 0n)
      .map((r) => ({ ...r, from: lower(r.from) }))
      .sort((x, y) => x.at - y.at)[0] ?? null
  );
}

/**
 * builder / mainFunders: Map<lowercase address, label> (mainFunders already excludes exchange-like funders).
 * nonceAtStart: transactions the wallet had sent by the start block (its own activity).
 * Returns verdict "eligible" | "not eligible" | "check by hand", with one line per rule.
 */
export function evaluate({ address, builder, mainFunders, funding, fundingComplete = true, nonceAtStart, startLabel, isContract }) {
  const a = lower(address);
  const checks = [];
  const mine = builder.get(a) ?? mainFunders.get(a);
  checks.push({ rule: "not yours", ok: !mine, detail: mine ? `this is your ${mine}` : "not in your builder wallets" });

  if (!funding) {
    checks.push({ rule: "not first funded by you", ok: null, detail: "no incoming funding found" });
  } else {
    const by = builder.get(funding.from) ?? mainFunders.get(funding.from);
    const where = `(${funding.what}, ${iso(funding.at)})`;
    if (by) checks.push({ rule: "not first funded by you", ok: false, detail: `first funded by your ${by} ${where}` });
    else if (!fundingComplete) checks.push({ rule: "not first funded by you", ok: null, detail: `history too long to reach the first funding; earliest seen from ${funding.from} ${where}` });
    else checks.push({ rule: "not first funded by you", ok: true, detail: `first funded by ${funding.from} ${where}` });
  }

  if (isContract) {
    checks.push({ rule: "own Celo activity before start", ok: null, detail: "smart-contract wallet: its activity may be sent by a relayer, check by hand" });
  } else {
    checks.push({
      rule: "own Celo activity before start",
      ok: nonceAtStart > 0,
      detail: nonceAtStart > 0 ? `had sent ${nonceAtStart} tx(s) by ${startLabel}` : `had sent no transactions by ${startLabel}`,
    });
  }

  const verdict = checks.some((c) => c.ok === false) ? "not eligible" : checks.some((c) => c.ok === null) ? "check by hand" : "eligible";
  return { address: a, verdict, checks };
}

const iso = (s) => new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
