# myrmidons-os — LLM working notes

Frontend of myrmidons-strategies.com. Next.js 15 (App Router) + TypeScript +
Tailwind + wagmi/viem/RainbowKit + TanStack Query + recharts. Deployed on
Vercel from `main`. `pnpm install && pnpm dev` (dev CSS compilation requires
the ESM tailwind config — never use `require()` in `tailwind.config.ts`).

## What this site is

A terminal-styled dashboard for MYRMIDONS strategies on HyperEVM (chainId 999):

- **HEGEMON** — live Morpho MetaMorpho (V1) USDT0 reallocator vault.
- **HEGEMON_V2** — in-dev Morpho Vault V2 reallocator, ONE bot process running
  THREE vaults: USDT0 ("Test MYRMIDONS V2"), USDC ("MYRMIDONS USDC", added
  2026-07-22) and WHYPE ("MYRMIDONS WHYPE", added 2026-08-25). Bot repo:
  github.com/achillesbro/HEGEMON_V2 (spec: HEGEMON_V2_STRATEGY_SPEC.md there).
- **EREBUS** — private liquidation engine (page only, no vault).

Vault addresses + chain ids: `lib/constants/vaults.ts` (single source).
- V1: `USDT0_VAULT_ADDRESS` = 0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42
- V2: `HEGEMON_V2_VAULT_ADDRESS` = 0xB851D568d123077E787860a34da286255249d983
- V2 USDC: `USDC_V2_VAULT_ADDRESS` = 0x7EE335d7Bd6355C5fa651776B0EBdB726f929766
- V2 WHYPE: `WHYPE_V2_VAULT_ADDRESS` = 0xC5B1cBb77B27613d23d577E3caa7ef6Dd14bA70b

## Route map

| Route | What |
|---|---|
| `/` (`app/page.tsx` → `components/landing/LandingPage.tsx`) | Landing/explainer: hero + loop + MNEMON/HEGEMON sections with live KPIs, best-market `MnemonMarketDrilldown`, embedded `ReallocatorTerminal` live feed, status table, contact. Redirects legacy `/#file=`/`/#tool=` deep links to `/terminal`. |
| `/terminal` (`app/terminal/page.tsx`, ~3.2k lines) | The OS: CLI terminal + strategies/tools floating panes. All CLI commands live here. Site `Header` hides on `/` and `/terminal`. |
| `/vaults` | Tile index (shared `VaultTileCard`, live TVL/APY; V1 listed as deprecated) |
| `/vaults/usdt0` | V1 vault page (overview + strategy tabs) |
| `/vaults/usdt0-v2` | V2 vault page — thin wrapper over `components/vault/VaultV2Page.tsx` |
| `/vaults/usdc-v2` | USDC V2 vault page — same shared `VaultV2Page`, different address/asset props |
| `/vaults/whype-v2` | WHYPE V2 vault page — same shared `VaultV2Page` (18-dec asset; decimals read on-chain) |
| `/tools/mnemon` | MNEMON Market Analyser (TOOLS pane tile → dedicated page) |
| `/docs` (`app/docs/[slug]`, redirect from `/docs`) | Public docs, five pages (overview/hegemon/mnemon/risk/vaults). Content = typed block lists in `lib/docs/content.ts` — the SINGLE source for both renderers: `components/docs/DocPage.tsx` (flowing prose under the AppShell header, same shell as the vault/MNEMON pages; lead sections render with NO heading, only tables/formulas/banners carry hairlines — never full boxes) and the terminal's `man <page>` command (`renderDocToMan`, plain lines with NBSP indentation because terminal out-lines collapse whitespace, coloured by MEANING via `lib/docs/man-highlight.ts` — white headings, gold identifiers/values, red failure modes, green healthy states). No MDX. Live values (HEGEMON constants, vault addresses) import from the modules the site runs on; MNEMON/RISK thresholds are hand-copied — update `content.ts` when those repos retune. Linked in the landing footer (SITE column). |
| `/branding` | Design-system spec (colors, fonts, conventions); unlinked (footer link removed 2026-08-31, page kept) |
| `/test` | Internal design lab — static mocks of landing/vault/MNEMON layouts (incl. the MNEMON drill-down, deposit panel, live feed, docs snippet) with a theme/font switcher (CURRENT + two Blade Runner variants) for eyeballing global styling changes. Deliberately unlinked; keep it that way |
| `/api/morpho/vault/{metadata,apy,allocations,markets,history}` | Server proxies to Morpho GraphQL |
| `/api/mnemon/{market-health,util-spells}` | Proxy for the MNEMON archive's static JSON (env `MNEMON_DATA_URL`, default data.myrmidons-strategies.com; whitelist + revalidate + Zod) |
| `/api/risk/markets` | Proxy for the myrmidons-api risk JSON (env `RISK_API_URL`, default api.myrmidons-strategies.com; same whitelist/Zod pattern, `lib/risk/`) |
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
risk-model panel, borrower risk, collateral vol); the TOOLS pane shows a 4-KPI
summary. The loan filter narrows the table only (KPIs stay the global overview). Two rules the FE
enforces on top of the raw data: **idle markets (null collateral) are excluded**
(`isRealMarket` — vault cash, not lending markets), and **"best" APY always
means best *investable*** (`isInvestable`: non-broken + available ≥ $10k), so a
12,000% dust market never reads as the benchmark. Glitch-reveal + chart loader
match the vault pages. No FE change is needed when MNEMON widens its market set.
Multi-chain since 2026-08-20 (MNEMON export schema_version 5): every row
carries `chain_id` (missing = 999, pre-v5). A CHAIN pill row (ALL /
HYPEREVM / ROBINHOOD, same layout as the loan row) renders in both tabs;
the state lives in `app/tools/mnemon/page.tsx` so it carries across tabs.
The ALL view tags each market row with its chain (`chainTag` in
`lib/mnemon/format.ts` — also home of `MNEMON_CHAINS`/`chainOf`).
The per-market drill-down is `MnemonMarketDrilldown` (chart + the RISK
panel + metric panels). The RISK panel (replaced the util-spells list
2026-08-20 — redundant with the Utilization tile's TIME>95/99 fields)
shows myrmidons-api model outputs via `lib/risk/` (schemas/browser/queries
mirroring `lib/mnemon`): liq_capacity ratio (lender bad-debt gauge, ≥1x =
whole book clears profitably), buffer_breach_freq 1h/24h, max drawdown.
Since 2026-08-25 (api v0.4.0) risk-model outputs also feed the other
panels — top-k supply/borrow shares, avg_util 7d/30d, TIME>95/99, and
collateral vol come from `riskMetric(...)`, not the MNEMON export
(hourly cadence, deliberate — "MYRMIDONS risk model" tooltips mark them).
Counts, addresses, health factors, oracle fields and flows stay MNEMON.
A chart series toggle fed by the per-metric history endpoints was built
and REMOVED 2026-08-20 (owner call — one chart, one job); the proxy only
whitelists markets.json now. The drill-down is reused both by the `/tools/mnemon` table and by the **vault-page
allocation tables**: each allocation row is an expandable `GridTable` row
(`onClick` + `expandedContent`) that matches its market via
`marketMap→marketId` against `useMarketHealth()` and drops down the same drill-
down. Rows MNEMON doesn't track (idle / OTHERS) aren't expandable. Since
2026-08-20 the vault rows' market columns (Util / Supply APY / APY@Target /
Supply / Available / Net 24h / MNEMON badges) mirror the analyser table
exactly — same MNEMON source, same formatters, shared `FlowCell`/`StatusCell`
— keeping the vault-specific Weight column and HEGEMON band chip.

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
2. **Terminal CLI** in `app/terminal/page.tsx` `handleCommandSubmit`: `deposit`/
   `withdraw` (V1) and `deposit-v2`/`withdraw-v2` (V2) share one parametrized
   block (regex `^deposit(-v2)?\s+(.+)$`, `vaultLabel` prefixes terminal lines).

## Terminal CLI (`/terminal`) — filesystem navigation

**`lib/landing/filesystem.ts` is the single source of truth** for the terminal's
virtual FS: two dirs (`STRATEGIES/`, `TOOLS/`), each backing one pane, files
carrying `name` (CLI name = tile label), `id` (pane hash id), `title`,
`secondary`, `status`, `access`, `route` (presence = runnable, `*` in ls) and
`aliases`. Adding a tile = adding one entry there; the CLI (`cd`/`ls`/`open`/
`run`/`tree`), both pane indexes (`StrategiesWindowContent` via
`paneGroups("strategies")`, `ToolsWindowContent` via `components/tools/
fileGroups.ts` shim) and tile labels (`labelsForId`) all derive from it.

Navigation model in `app/terminal/page.tsx`: `cwdName` (`STRATEGIES` | `TOOLS` | null)
mounts/unmounts panes — the panes are a rendering of the CLI state, not a
parallel nav system. Selection travels through the `#file=`/`#tool=` URL hash
(the page↔pane bus; `selectedEntry` state mirrors it via `hashchange`). The
prompt shows `GUEST@MYRMIDONS:/PATH >` (wallet short-address when connected).
`cd ..` deselects first, then unmounts; `back`/`exit` alias it. `open` resolves
cwd-first then unique-global (auto-mounts with a note); `run` routes to the
file's dedicated page (`Private` ⇒ permission denied). One-word legacy
shortcuts (`strategies`, `mnemon`, `hegemon`, `usdc`…) live in
`LEGACY_ALIASES` inside `runCommand` and print their canonical expansion
before executing. Pane tile clicks echo `open <name>` into the log via the
`onCliEcho` prop (page passes `echoPaneOpen`).

Tile status drives the `ShardEntry` dot: `ACTIVE`=green, `IN DEVELOPMENT`=gold
(both pulse), `OFFLINE`=red (no pulse), else dim. The viewport pill is
`components/ui/status-indicator.tsx` (`live` / `dev` ("IN DEV") /
`maintenance` / `offline`). Current tiles: MYRMIDONS_USDT0=dev,
MYRMIDONS_USDC=dev, MYRMIDONS_WHYPE=dev (all "VAULT_V2 // HEGEMON_V2" —
**HEGEMON_V2 is the reallocator program, never a vault name**; tiles are
named after the vaults),
HEGEMON=offline (V1 vault deprecated — keeper stopped on the VPS 2026-07-17;
page still allows withdrawals), EREBUS=offline. The V2 tiles' `v2Meta` lookup
(address/route/asset) still lives inside StrategiesWindowContent's FileScreen;
the vault pages share `components/vault/VaultV2Page.tsx` (props: vaultAddress/
vaultChainId/assetSymbol/assetLogoSrc) — extend that, don't fork the page.
Allocation rows are matched to market data by `marketId`
(AllocationRow.marketId), not label: two markets can share a label at
different LLTVs. Market labels are "collateral / loan" everywhere (MNEMON's
convention) — built in BOTH `pickAllocations` (view.ts) and the markets API
route; keep them in sync. Token icons: `public/USDT0-TokenIcon.png`,
`public/USDC-TokenIcon.svg`, `public/WHYPE-TokenIcon.svg` (DepositPanel
`assetLogoSrc`).

CLI plumbing to update when adding commands: `runCommand` (sync + pane
side-effects), `handleCommandSubmit` (async/writes), `SUGGEST_POOL`,
`HIGHLIGHT_TERMS` (+ the nav-command fallback regex in the renderer),
`help *` topics, the Tab-completion pool and the cwd-aware mobile chips.

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
`/api/logs/stream`. It also takes `vaultFilter` (a vault address): the V2 bot
runs several vaults on ONE stream, and since 2026-07-22 tags every per-vault
event with `vault` — the terminal drops structured events attributed to
another vault, while vault-agnostic lines (tick_start/tick_end, V1 keeper)
always pass. `VaultV2Page` passes its own address. The V2 bot emits JSONL tagged `bot: "HEGEMON_V2"`; the
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
- Fonts: `--font-header` is **Departure Mono** (self-hosted single-weight
  pixel font, `app/fonts/`) — headings (h1–h6 via globals.css), all
  `tracking-widest`/`tracking-wider` text (micro-label convention, globals.css
  rule) and KPI values (`GridKpi`). Body/tables/terminal stay IBM Plex Mono
  (`--font-body`); Cinzel (`--font-brand`) is the header wordmark only. No
  real bold in Departure — hierarchy via size/color. Block-glyph ASCII art
  (e.g. landing wordmark) must NOT get a tracking class: pixel glyphs don't
  fill tall line boxes and the art shreds.
- Branch + PR for features; owner reviews before Vercel deploy from `main`.
- If `next dev` fights over ports/stale code: kill all `next dev`, `rm -rf .next`.
