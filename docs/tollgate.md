# Requirements tollgate: probed 2026-11-03 (read-only)

| Check | Result | Evidence |
|---|---|---|
| git | PASS | 2.53.0.windows.1 |
| git identity | FLAG | global user `Stella112`; Maris must confirm this is the right identity |
| gh auth | FLAG | active `Stella112`; also logged in: `Mrcube3`, `deamybro`. Repo owner must be confirmed |
| Node >=20 | PASS | v26.4.0 (better-sqlite3 native build on Node 26 not yet tested) |
| pnpm | PASS | 10.34.6 |
| Foundry | PASS | forge and cast 1.8.3 |
| Python | PASS (only if needed) | 3.11.9; uvx 0.11.24 |
| forno.celo.org | PASS | returned chainId 42220 |
| api.textilecredit.com | PASS | /v2/rfq/preview returned quotes |
| gateway.usebuy.ai | PASS | /v1/catalog 200 |
| api.x402.celo.org | PASS | /supported 200 |

Existing repo: none. The working directory was empty, so the monorepo skeleton was scaffolded. `git init` is held until the identity is confirmed.
