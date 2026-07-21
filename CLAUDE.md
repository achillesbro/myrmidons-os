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
| `/tools/mnemon` | MNEMON Market Analyser (TOOLS pane tile → dedicated page) |
| `/api/morpho/vault/{metadata,apy,allocations,markets,history}` | Server proxies to Morpho GraphQL |
| `/api/mnemon/{market-health,util-spells}` | Proxy for the MNEMON archive's static JSON (env `MNEMON_DATA_URL`, default data.myrmidons-strategies.com; whitelist + revalidate + Zod) |
| `/api/logs/stream` | V1 keeper log stream (SSE proxy) |
| `/api/logs/hegemon-v2/stream` | V2 keeper log stream (proxy to logs.myrmidons-strategies.com/v2/sse; env `LOG_STREAM_URL_V2`/`LOG_STREAM_TOKEN_V2`) |

## MNEMON Market Analyser (`/tools/mnemon`, `lib/mnemon/`, `components/tools/mnemon/`)

Surfaces the MNEMON archive's HyperEVM Morpho market data (MNEMON repo writes
static JSON to `data.myrmidons-strategies.com`; **not the Morpho API** — it's a
15-min sampled archive with a broken-market classifier + borrower risk the raw
API can't give). Data layer mirrors `lib/morpho`: `schemas.ts` (Zod, all
schema-v2 fields `nullish` for back-compat), `browser.ts`, `queries.ts`
(TanStack, 2-min refetch), `format.ts`, `aggregate.ts` (`computeMarketStats` +
`isInvestable`/`isRealMarket`). Page = KPI strip (6) + a loan-token quick-filter
row + sortable market table with row drill-down (7d APY/util recharts sparkline,
util spells, borrower risk, collateral vol); the TOOLS pane shows a 4-KPI
summary. The loan filter narrows the table only (KPIs stay the global overview). Two rules the FE
enforces on top of the raw data: **idle markets (null collateral) are excluded**
(`isRealMarket` — vault cash, not lending markets), and **"best" APY always
means best *investable*** (`isInvestable`: non-broken + available ≥ $10k), so a
12,000% dust market never reads as the benchmark. Glitch-reveal + chart loader
match the vault pages. No FE change is needed when MNEMON widens its market set.
The per-market drill-down is `MnemonMarketDrilldown` (chart + spells + risk
panels) — reused both by the `/tools/mnemon` table and by the **vault-page
allocation tables**: each allocation row is an expandable `GridTable` row
(`onClick` + `expandedContent`) that matches its market via
`marketMap→marketId` against `useMarketHealth()` and drops down the same drill-
down. Rows MNEMON doesn't track (idle / OTHERS) aren't expandable.

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
Any new strategy tile must be added in BOTH files. Tile status (`FileStatus`)
drives the `ShardEntry` dot: `ACTIVE`=green, `IN DEVELOPMENT`=gold (both pulse),
`OFFLINE`=red (no pulse), else dim — and this union is **also duplicated in both
files**. The viewport pill is `components/ui/status-indicator.tsx` (`live` /
`dev` ("IN DEV") / `maintenance` / `offline`). Current tiles (top→bottom in the
strategy panel): HEGEMON_V2=dev, HEGEMON=offline (V1 vault deprecated —
keeper stopped on the VPS 2026-07-17; page still allows withdrawals),
EREBUS=offline.

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

## Keeper live feed (TERMINAL // LIVE_FEED)

`ReallocatorTerminal` takes a `streamPath` prop; V2 page passes
`/api/logs/hegemon-v2/stream` (proxy → `logs.myrmidons-strategies.com/v2/sse`,
env `LOG_STREAM_URL_V2`/`LOG_STREAM_TOKEN_V2`), V1 defaults to
`/api/logs/stream`. The V2 bot emits JSONL tagged `bot: "HEGEMON_V2"`; the
`lib/logs/jsonl.ts` formatter renders V2-specific `plan.moves` (per-market flow
`out: kHYPE −2.10 → in: WHYPE +2.58`, weight before→after, simulated
`apy X→Y`, `liq→market` on rotation) and `tick_skip` reasons (churn / yield-gate
detail come straight from the bot's `reason` field). V1 events lack `moves` so
their rendering is untouched. Keep the `JsonlEvent.plan` type in sync with the
bot's `events.ts` payload. The bot's per-tick `scores` event (full market table,
for downstream ingestion like MNEMON) is **dropped** from the terminal in
`ReallocatorTerminal` (`evt.type === "scores"` early return) — too verbose for
humans; MNEMON consumes it off the raw SSE directly, not through this FE.

## Known gaps / deliberate state (as of 2026-07-17)

- `LastReallocKpiCard` is V1-keeper-log-bound; the V2 page shows a static
  IN DEV status KPI instead. Wiring it to the V2 stream is a follow-up.
- V2 NAV history is sparse (vault deployed 2026-07-17); fills in as the API
  accrues `avgNetApy` points.
- `MORPHO_API_BASE_URL` / `MORPHO_API_KEY` env vars optional (defaults to the
  public endpoint). `LOG_STREAM_URL_V2` + `LOG_STREAM_TOKEN_V2` required in
  Vercel for the V2 live feed.

## Conventions

- pnpm only. `pnpm build` = typecheck + lint gate (react/no-unescaped-entities
  is enforced — escape apostrophes in JSX text).
- Styling: terminal aesthetic, `font-mono`, CSS vars (`--gold`, `--success`,
  `--danger`, `--border`), uppercase micro-labels (`text-[9px] tracking-widest`).
- Branch + PR for features; owner reviews before Vercel deploy from `main`.
- If `next dev` fights over ports/stale code: kill all `next dev`, `rm -rf .next`.
