# myrmidons-os — LLM working notes

Frontend of myrmidons-strategies.com. Next.js 15 (App Router) + TypeScript +
Tailwind + wagmi/viem/RainbowKit + TanStack Query + recharts. Deployed on
Vercel from `main`. `pnpm install && pnpm dev` (dev CSS compilation requires
the ESM tailwind config — never use `require()` in `tailwind.config.ts`).

## What this site is

A terminal-styled dashboard for MYRMIDONS strategies on HyperEVM (chainId 999):

- **HEGEMON** — live Morpho MetaMorpho (V1) USDT0 reallocator vault.
- **HEGEMON_V2** — in-dev Morpho Vault V2 USDT0 reallocator ("Test MYRMIDONS V2").
  Bot repo: github.com/achillesbro/HEGEMON_V2 (spec: HEGEMON_V2_STRATEGY_SPEC.md there).
- **EREBUS** — private liquidation engine (page only, no vault).

Vault addresses + chain ids: `lib/constants/vaults.ts` (single source).
- V1: `USDT0_VAULT_ADDRESS` = 0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42
- V2: `HEGEMON_V2_VAULT_ADDRESS` = 0xB851D568d123077E787860a34da286255249d983

## Route map

| Route | What |
|---|---|
| `/` (`app/page.tsx`, ~3.2k lines) | Landing: CLI terminal + strategies/tools floating panes. All CLI commands live here. |
| `/vaults` | Simple AsciiCard index |
| `/vaults/usdt0` | V1 vault page (overview + strategy tabs) |
| `/vaults/usdt0-v2` | V2 vault page (copy of V1, V2-wired) |
| `/api/morpho/vault/{metadata,apy,allocations,markets,history}` | Server proxies to Morpho GraphQL |
| `/api/logs/stream` | V1 keeper log stream (SSE). No V2 stream yet. |

## Data layer (the part that bites)

Server routes proxy `https://api.morpho.org/graphql` (`lib/morpho/client.ts`).
Frontend: `lib/morpho/browser.ts` (fetchers) → `lib/morpho/queries.ts`
(TanStack hooks) → components. Zod shapes in `lib/morpho/schemas.ts`, view
transforms (`pickKpis`, `pickAllocations`) in `lib/morpho/view.ts`.

**V1 vaults** use the `vaultByAddress` entity (`state.{...}`, `state.allocation[]`,
`historicalState.netApy`).

**V2 vaults** use `vaultV2ByAddress` — different shape: fields directly on the
vault (no `state` wrapper), **no allocation array** (positions are held by the
vault's MorphoMarketV1 adapter; query `marketPositions` with
`userAddress_in: [adapterAddress]`), idle funds are first-class `idleAssets`,
APY history is `avgNetApy`, and `sharePriceUsd` doesn't exist (derive as
`sharePrice × asset.price.usd`). **All V2 normalization lives in
`lib/morpho/v2.ts`**, which rebuilds the V1 `vaultByAddress` response shape so
every downstream consumer works unchanged. The five API routes take `?v2=true`;
the `useVault*` hooks take a trailing `v2` boolean (part of the query key).
Adding V2 data = extend `v2.ts`, never fork the components.

Morpho API drift notes (2026-07): `Market.uniqueKey` → `marketId` (filters
still accept `uniqueKey_in`); `Asset.priceUsd` deprecated → `price { usd }`.
When a GraphQL field 404s, introspect: `{ __type(name: "X") { fields { name } } }`.

## Contract writes

All in `lib/web3/vault.ts` (plain viem, not wagmi hooks): `deposit(assets,
receiver)`, `withdraw(assets, receiver, owner)`, `approveExact` (USDT-style
zero-reset), `previewDeposit`, `convertSharesToAssets`, plus readers. ABIs in
`lib/web3/abis/{erc20,erc4626}.ts`. **Vault V2 is ERC-4626 — the same
functions work for both vaults**; only the address differs. Decimals are
always read on-chain (V1/V2 share decimals both 18, asset 6).

Two write surfaces:
1. **`components/vault/DepositPanel.tsx`** (~990 lines) — used by both vault
   pages. Props: `vaultAddress`, `v2` (only affects its internal metadata
   query), `initialAmount`/`initialMode` (from `?deposit=`/`?withdraw=` URL
   params). Approve→auto-deposit flow with receipt-hook + fallback polling.
   Transaction logs are **append-only** (do not reintroduce
   `setTransactionLogs([])` clears — reverted by request).
2. **Landing CLI** in `app/page.tsx` `handleCommandSubmit`: `deposit`/
   `withdraw` (V1) and `deposit-v2`/`withdraw-v2` (V2) share one parametrized
   block (regex `^deposit(-v2)?\s+(.+)$`, `vaultLabel` prefixes terminal lines).

## Landing page CLI — where everything is duplicated

`app/page.tsx` and `components/landing/StrategiesWindowContent.tsx` each carry
their **own copy** of `fileGroups` (tiles), `getFileLabels`, and `FileScreen`.
Any new strategy tile must be added in BOTH files. Tile status drives the dot
(`ACTIVE`=green, `IN DEVELOPMENT`=gold); the viewport pill is
`components/ui/status-indicator.tsx` (`live` / `dev` ("IN DEV") /
`maintenance` / `offline`).

CLI plumbing to update when adding commands: `runCommand` (sync, read-only),
`handleCommandSubmit` (async/writes), `SUGGEST_POOL`, `HIGHLIGHT_TERMS`,
`help *` topics, `ls`/`pwd`/`status` outputs.

## Strategy math on the pages

- V1: `lib/strategy/adaptiveCurve.ts` (`STRATEGY_CONSTANTS`, U0 0.82).
- V2: `lib/strategy/hegemonV2.ts` (`HEGEMON_V2_CONSTANTS`, U0 0.88, σ 0.05,
  U_SAT 0.92, U_CRIT 0.95). **Duplicates the bot's
  `apps/config/src/strategies/hegemon.ts` by value — keep in sync when the bot
  is retuned.** The V2 bell chart plots `effectiveUtilAttractivenessV2`
  (bell × 0.4 in the saturated band, 0 at U_CRIT) with explicit pre/post
  threshold points and `type="linear"` so the cliffs stay vertical; x-range is
  symmetric around U0. V2 allocation-table status labels use the V2 thresholds.

## Layout gotchas

- Vault-page tab grids: `grid … min-h-full` stretches row tracks when content
  is short (few allocation rows) → oversized KPI boxes and phantom gaps. The
  V2 page adds `content-start`; do the same for any new sparse page.
- Charts: recharts; wide content scrolls in its own container; GlitchTypeText
  for animated values, TerminalScrollLoader for heavy loading states.
- Grid panels: `border-l border-t` on the grid, `border-r border-b` per panel.

## Known gaps / deliberate state (as of 2026-07-17, PR #3)

- V2 keeper log stream not wired: V2 page sidebar shows an "IN DEV"
  placeholder instead of `ReallocatorTerminal` (which streams V1 logs);
  `LastReallocKpiCard` is also V1-log-bound (V2 page shows a static IN DEV KPI).
- V2 NAV history is sparse (vault deployed 2026-07-17); fills in as the API
  accrues `avgNetApy` points.
- `MORPHO_API_BASE_URL` / `MORPHO_API_KEY` env vars optional (defaults to the
  public endpoint).

## Conventions

- pnpm only. `pnpm build` = typecheck + lint gate (react/no-unescaped-entities
  is enforced — escape apostrophes in JSX text).
- Styling: terminal aesthetic, `font-mono`, CSS vars (`--gold`, `--success`,
  `--danger`, `--border`), uppercase micro-labels (`text-[9px] tracking-widest`).
- Branch + PR for features; owner reviews before Vercel deploy from `main`.
- If `next dev` fights over ports/stale code: kill all `next dev`, `rm -rf .next`.
