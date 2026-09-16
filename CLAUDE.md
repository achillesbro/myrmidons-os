# myrmidons-os — LLM working notes

Frontend of myrmidons-strategies.com. Next.js 15 (App Router) + TypeScript +
Tailwind + wagmi/viem/RainbowKit + TanStack Query + recharts. Deployed on
Vercel from `main`. `pnpm install && pnpm dev` (dev CSS compilation requires
the ESM tailwind config — never use `require()` in `tailwind.config.ts`).

## What this site is

A terminal-styled dashboard for MYRMIDONS strategies on HyperEVM (chainId 999):

- **HEGEMON_V2** — in-dev Morpho Vault V2 reallocator, ONE bot process running
  THREE vaults: USDT0 ("Test MYRMIDONS V2"), USDC ("MYRMIDONS USDC", added
  2026-07-22) and WHYPE ("MYRMIDONS WHYPE", added 2026-08-25). Bot repo:
  github.com/achillesbro/HEGEMON_V2 (spec: HEGEMON_V2_STRATEGY_SPEC.md there).
- **EREBUS** — private liquidation engine (page only, no vault).

The original V1 MetaMorpho USDT0 vault (HEGEMON V1) was REMOVED from the
site on 2026-09-15 after every depositor exited — no page, tile, constant,
command, docs row or log stream refers to it; do not reintroduce it. The
site treats the three V2 vaults as the only vaults that ever existed.

Vault addresses + chain ids: `lib/constants/vaults.ts` (single source).
- V2: `HEGEMON_V2_VAULT_ADDRESS` = 0xB851D568d123077E787860a34da286255249d983
- V2 USDC: `USDC_V2_VAULT_ADDRESS` = 0x7EE335d7Bd6355C5fa651776B0EBdB726f929766
- V2 WHYPE: `WHYPE_V2_VAULT_ADDRESS` = 0xC5B1cBb77B27613d23d577E3caa7ef6Dd14bA70b

## Route map

| Route | What |
|---|---|
| `/` (`app/page.tsx` → `components/landing/LandingPage.tsx`) | Landing/explainer: hero + loop + MNEMON/HEGEMON sections with live KPIs, best-market `MnemonMarketDrilldown`, embedded `ReallocatorTerminal` live feed, status table, contact. Redirects legacy `/#file=`/`/#tool=` deep links to `/terminal`. |
| `/terminal` (`app/terminal/page.tsx`, ~3.2k lines) | The OS: CLI terminal + strategies/tools floating panes. All CLI commands live here. Site `Header` hides on `/` and `/terminal`. |
| `/vaults` | Tile index (shared `VaultTileCard`, live TVL/APY) |
| `/vaults/usdt0-v2` | V2 vault page — thin wrapper over `components/vault/VaultV2Page.tsx` |
| `/vaults/usdc-v2` | USDC V2 vault page — same shared `VaultV2Page`, different address/asset props |
| `/vaults/whype-v2` | WHYPE V2 vault page — same shared `VaultV2Page` (18-dec asset; decimals read on-chain) |
| `/tools/mnemon` | MNEMON Market Analyser (TOOLS pane tile → dedicated page). The site header's nav label for it is **MARKETS** (owner call 2026-09-15 — the program is still called MNEMON everywhere else: tile, page label, docs, terminal). |
| `/portfolio` | Positions tracker (TOOLS pane tile `PORTFOLIO`, header nav, `run portfolio`): the connected wallet's MYRMIDONS vault shares + every Morpho Blue position on the MNEMON-indexed chains, read on-chain (`lib/web3/portfolio.ts`), joined with the MNEMON snapshot for cheap insights. See "Portfolio" below. |
| `/docs` (`app/docs/[slug]`, redirect from `/docs`) | Public docs, five pages (overview/hegemon/mnemon/risk/vaults). Content = typed block lists in `lib/docs/content.ts` — the SINGLE source for both renderers: `components/docs/DocPage.tsx` (flowing prose under the AppShell header, same shell as the vault/MNEMON pages; lead sections render with NO heading, only tables/formulas/banners carry hairlines — never full boxes) and the terminal's `man <page>` command (`renderDocToMan`, plain lines with NBSP indentation because terminal out-lines collapse whitespace, coloured by MEANING via `lib/docs/man-highlight.ts` — white headings, gold identifiers/values, red failure modes, green healthy states). No MDX. Live values (HEGEMON constants, vault addresses) import from the modules the site runs on; MNEMON/RISK thresholds are hand-copied — update `content.ts` when those repos retune. Linked in the landing footer (SITE column). |
| `/branding` | Design-system spec (colors, fonts, conventions); unlinked (footer link removed 2026-08-31, page kept) |
| `/test` | Internal design lab — static mocks of landing/vault/MNEMON layouts (incl. the MNEMON drill-down, deposit panel, live feed, docs snippet) with a theme/font switcher (CURRENT + two Blade Runner variants) for eyeballing global styling changes. Deliberately unlinked; keep it that way |
| `/api/morpho/vault/{metadata,apy,allocations,markets,history}` | Server proxies to Morpho GraphQL |
| `/api/mnemon/{market-health,util-spells}` | Proxy for the MNEMON archive's static JSON (env `MNEMON_DATA_URL`, default data.myrmidons-strategies.com; whitelist + revalidate + Zod) |
| `/api/risk/markets` | Proxy for the myrmidons-api risk JSON (env `RISK_API_URL`, default api.myrmidons-strategies.com; same whitelist/Zod pattern, `lib/risk/`) |
| `/api/logs/hegemon-v2/stream` | V2 keeper log stream (proxy to logs.myrmidons-strategies.com/v2/sse; env `LOG_STREAM_URL_V2`/`LOG_STREAM_TOKEN_V2`) |

## MNEMON Market Analyser (`/tools/mnemon`, `lib/mnemon/`, `components/tools/mnemon/`)

Surfaces the MNEMON archive's HyperEVM Morpho market data (MNEMON repo writes
static JSON to `data.myrmidons-strategies.com`; **not the Morpho API** — it's a
15-min sampled archive with a broken-market classifier + borrower risk the raw
API can't give). Data layer mirrors `lib/morpho`: `schemas.ts` (Zod, all
schema-v2 fields `nullish` for back-compat), `browser.ts`, `queries.ts`
(TanStack, 2-min refetch), `format.ts`, `aggregate.ts` (`computeMarketStats` +
`isInvestable`/`isRealMarket`). Page = KPI strip (6) + a filter row (CHAIN /
LOAN / ORACLE FilterSelects + search by market id or any address in the pricing path: oracle, feed legs, MODT primary/backup) + sortable market table with
row drill-down (7d APY/util recharts sparkline, risk-model panel, borrower
risk, collateral vol); the TOOLS pane shows a 4-KPI summary. The ORACLE
filter (2026-09-01) matches by provider token (`oracleProviders` in
`lib/risk/oracle.ts` — a composed oracle matches every provider it reads,
MODT wrappers via their failover legs; honest buckets UNVERIFIED /
UNRESOLVED / BROKEN keep unidentified oracles findable). The loan/oracle
filters and the search drive the table AND the KPI tiles. Two rules the FE
enforces on top of the raw data: **idle markets (null collateral) are excluded**
(`isRealMarket` — vault cash, not lending markets), and **"best" APY always
means best *investable*** (`isInvestable` = the server flag; since MNEMON
export v8, 2026-09-16, a gate model — exit liquidity/regime, rate, oracle
overprice, bad debt, DEX liquidatability of at-risk debt, 1h flicker guard —
with `investable_reasons` / `investable_warnings` / `investable_inputs` per
market; lender concentration is a warning, never a veto; texts per code in
`lib/mnemon/format.ts` `investableGateText`, thresholds hand-copied), so a
12,000% dust market never reads as the benchmark. The table's STATUS cell
shows the one word INVESTABLE (green) and nothing else for a passing
market; the CONC pill is gone (95% of markets tripped it — noise). The
drill-down's NOT_INVESTABLE banner names the failed gates and appends the
gate inputs (debt at risk, Relay rung and slippage vs the bonus,
utilization if the top lender left); an investable market shows no gate
banner. No 7th metric panel: the 3-column grid leaves empty cells in
border colour. KPI tiles: INVESTABLE's subtitle lists the top failing
gates, AT-RISK counts markets failing the LIQUIDATABLE gate (was HF <
1.05), TOTAL SUPPLY's subtitle carries the broken breakdown.
Glitch-reveal + chart loader match the vault pages. No FE change is needed
when MNEMON widens its market set.
Multi-chain since 2026-08-20 (MNEMON export schema_version 5): every row
carries `chain_id` (missing = 999, pre-v5). A CHAIN dropdown (`FilterSelect`,
options sorted by market count, biggest first — since 2026-09-09; ties keep
`MNEMON_CHAINS` order) renders in both tabs; the state lives in
`app/tools/mnemon/page.tsx` so it carries across tabs. A chain with
`explorer: null` (Arc, 5042) renders tx/address links as plain text.
The ALL view tags each market row with its chain (`chainTag` in
`lib/mnemon/format.ts` — also home of `MNEMON_CHAINS`/`chainOf`).
The per-market drill-down is `MnemonMarketDrilldown`: a hard-warning
BANNER (broken reason / non-structural depeg ≥5% or open spell / no
price = danger, not-investable = gold — warns, never blocks), the chart
with — analyser only, `actions` prop — the right column split 2/3 + 1/3
into the action panel (`MarketActionPanel`: DepositPanel's amount box
with HALF/MAX + gold primary button, in the drill-down's idiom — 9px
labels, Metric rows at the tiles' pitch, bg-bg-base box, glitch-in
values; LEND|WITHDRAW|BORROW|REPAY tabs live in the column's label row
via `ModeTabs`; the button is the wallet-state machine, no badges, no
token logos) and a `TransactionTerminal` (TX_LOGS) fed through
`onTransactionLogsChange`, never stacked below the panel. LEND/WITHDRAW:
one loan-token box + book metrics (UTIL_AFTER, BOOK_SHARE, YIELD_1Y).
BORROW/REPAY: collateral box + loan box, atomic pairs
(`supplyCollateralBorrow` / `repayWithdrawCollateral`, single-leg
fallbacks when one box is empty), risk metrics — COLLATERAL, DEBT, LTV,
LLTV, LIQ_PRICE, HEALTH, BORROW_APY, SAFE_MAX|WITHDRAWABLE — computed by
the SDK's own AccrualPosition on a PROJECTED position
(`projectPosition` in `lib/web3/blue.ts`), so the preview and the tx
guard share one math. MAX on borrow = 90% of the SDK's max borrowable
(`SAFE_BORROW_BPS`). **Dust rule:** a draft that covers the whole
position (typed or MAX) closes by SHARES (`closeAll`, derived — no flag);
anything less is assets mode and leaves interest dust, so WITHDRAWABLE
comes from `safeWithdrawableCollateral` (SDK guard's LLTV − 0.5% buffer,
minus 1 ppm rounding) on a position projected to the SDK's own horizon
(`projectionTimestamp` = max(now, lastUpdate) + 2h — the SDK validates
there; a shorter horizon under-counts the dust and the SDK refuses what
the panel promised). The 2026-09-14 field failure ("Withdrawing …
collateral would make position unhealthy … Actual Borrow assets: 51")
was exactly this: repay-first is correct, the 51 units were accrued
interest. TX_LOGS is absolutely positioned inside its column so a long
log scrolls instead of growing the row. All writes
go through `runBlueAction`: classic approve tx, one-time GeneralAdapter1
authorization, then the bundle; gas = estimate +50% (Morpho's
first-touch interest accrual is invisible to an estimate taken on the
previous block — the repay bundle died 1k gas short on the fork without
it) and a mined-but-reverted receipt throws. The chart stretches to that
row's height when `actions` is on (fixed h-64/h-48 otherwise) so the two
columns stay level. Then six panels — Borrower Risk / Lender Book /
Rates & Util / Collateral / Oracle / Flows. The 30d liquidation table
beside the chart was removed 2026-09-14 (liquidations still mark the
chart). Rates & Util shows SUPPLY_APY, BORROW_APY, SUPPLY_VS_BEST and
APY@TARGET; the table has a BORROW APY column (analyser only so far —
the vault allocation tables have not been given it yet). The old
Market panel dissolved 2026-09-01 (owner call, keeps the grid 3x2):
band/borrow_apy/vs_best -> Rates & Util, LLTV -> Collateral, market id
-> the table's market cell (name · chain · exact LLTV via `fmtLltv` ·
CopyableId). Panels stay <= ~5 visual rows: >4 metrics = a 2-col grid
inside the tile. The RISK panel (replaced the util-spells list
2026-08-20 — redundant with the Utilization tile's TIME>95/99 fields)
shows myrmidons-api model outputs via `lib/risk/` (schemas/browser/queries
mirroring `lib/mnemon`): liq_capacity ratio (lender bad-debt gauge, ≥1x =
whole book clears profitably), buffer_breach_freq 1h/24h, max drawdown.
Since 2026-08-25 (api v0.4.0) risk-model outputs also feed the other
panels — top-k supply/borrow shares, avg_util 7d/30d, TIME>95/99, and
collateral vol come from `riskMetric(...)`, not the MNEMON export
(hourly cadence, deliberate — "MYRMIDONS risk model" tooltips mark them).
Counts, addresses, health factors, oracle price/deviation and flows stay
MNEMON. Since api 1.3 (2026-09-02) vendors are EVIDENCE-GRADED upstream
(`vendor_evidence`: registry / canonical-contract / code-signature /
description); `legProvider` names a brand from a feed's description ONLY
when the vendor is null and marks the market's PROVIDER with " ?"
(`confidence: "claimed"`). Custom oracles carry `source_name` (Sourcify)
and `upstream` (feeds an adapter reads) — rendered as UPSTREAM rows and
"AUTHOR → PROVIDER" labels (e.g. "UMA OVAL → CHAINLINK"). Oracle IDENTITY
(the ORACLE panel: provider, composition legs,
owner status, shared-feed blast radius) comes from the risk API's
`oracle` block (api schema 1.1, 2026-09-01; `lib/risk/schemas.ts`
OracleBlock) — null-tolerant, panel shows NO_ORACLE_DATA until served.
`isStructuralOracle` (`lib/risk/oracle.ts`) marks exchange-rate/pegged
oracles: their VS_DEFILLAMA renders neutral with a STRUCT suffix and the
table's DEPEG badge is suppressed (structural deviation is a
fingerprint, not a depeg). The table's ORACLE badge (StatusCell, optional
`oracle` prop — vault pages don't pass it yet) flags broken (danger) or
opaque/unverified (gold) oracle contracts. NOTE: the OWNER row describes
the oracle WRAPPER contract; upstream feed owners (e.g. Chainlink
proxies) are not aggregated yet.
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

## Portfolio (`/portfolio`, `lib/web3/portfolio.ts`, `components/portfolio/PortfolioView.tsx`)

Owner scope (2026-09-14): Blue markets + the three vaults, MNEMON-indexed
chains only, cheap insights only, no history/P&L. `scanPortfolio(user,
markets, hypeUsd)` is framework-free and shared by the `usePortfolio` hook,
the terminal's `portfolio` command and the probe script: per chain in
`PORTFOLIO_CHAINS` (= `MNEMON_CHAINS` ∩ `CHAINS`; Arc has no RPC) ONE
`position(id, user)` multicall over that chain's MNEMON market set
(`batchSize: 200_000` — viem's 1 KiB default splits into dozens of
round-trips that public RPCs rate-limit), then the SDK's accrued market +
position entities for the non-zero hits; vaults via `balanceOf` +
`convertToAssets`. Each chain is capped at `CHAIN_SCAN_TIMEOUT_MS` (25s) and
reported in `failedChains` (rendered as RPC_TIMEOUT — "not read", never
"zero"). Whole 7-chain scan ≈ 1s. USD are ESTIMATES: loan price =
MNEMON `supply_usd` ÷ on-chain total supply, collateral at the oracle,
vault assets at par for stables / HYPE spot for WHYPE. Insights per
position: `better` (best investable same-loan-token market on the same
chain, only if ≥ 5 bps more), `exitCovered` (liquidity ≥ supply), LTV /
health / liq price from the SDK entity. Rows expand into
`MnemonMarketDrilldown` with `actions` on and `onActed` wired to the
portfolio refetch, so a confirmed tx refreshes the rows above it. The
WALLET bar (always shown) edits `?address=` — any wallet read-only, MINE
returns to the connected one — and carries SCANNED xS AGO + REFRESH.
Market params and token meta are cached for the session (`cachedParams`
/ `cachedMeta`), so a rescan is one multicall per chain plus the accrual
reads. BORROWS gets a LIQUIDATION_RISK banner below health 1.10. APY
cells carry the yearly figure ($/y) rather than an extra column — the
8-track grid is shared by the three tables and FLAGS stays. Vault rows
link DEPOSIT / WITHDRAW via the vault pages' `?deposit=` / `?withdraw=`.
The docs overview COMPONENTS table lists it. Read-only public clients are
built from `CHAINS` — which is why `lib/web3/chains.ts` overrides viem's
mainnet RPC (eth.merkle.io 429s) and adds multicall3 to Katana (viem's def
lacks it; canonical deployment is live).

## Data layer (the part that bites)

Server routes proxy `https://api.morpho.org/graphql` (`lib/morpho/client.ts`).
Frontend: `lib/morpho/browser.ts` (fetchers) → `lib/morpho/queries.ts`
(TanStack hooks) → components. Zod shapes in `lib/morpho/schemas.ts`, view
transforms (`pickKpis`, `pickAllocations`) in `lib/morpho/view.ts`.

**MetaMorpho-shaped (`vaultByAddress`) responses** carry `state.{...}`,
`state.allocation[]`, `historicalState.netApy` — the site has no MetaMorpho
vault any more, but this is the shape every consumer still reads.

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
receiver)`, `redeem(shares, receiver, owner)`, `approveExact` (USDT-style
zero-reset), `previewDeposit`, plus readers. **Exits are share-denominated**
(2026-09-14): the withdraw input IS shares, so call `redeem` with them —
the old convert-to-assets-then-`withdraw(assets)` path burned fewer shares
than typed once the share price moved (MAX left ~2e-7 shares of dust on
a mainnet fork after one day) and would revert outright if the price fell.
Same rule as the MNEMON market panel: reason in shares, interest changes
assets. ABIs in
`lib/web3/abis/{erc20,erc4626}.ts`. **Vault V2 is ERC-4626 — the same
functions work for both vaults**; only the address differs. Decimals are
always read on-chain (share decimals 18; asset 6 for USDT0/USDC, 18 for WHYPE).

**Morpho Blue markets (MNEMON drill-down lend/borrow, 2026-09-14)** are NOT
ERC-4626: writes go through `@morpho-org/morpho-sdk` (owns per-chain
Bundler3/GeneralAdapter1 addresses, approvals, authorizations, share math —
Morpho's guidance: never hand-build bundler calldata). `lib/web3/blue.ts` is
the seam: `blueActionsSupported(chainId)`, `blueMarket()`, `runBlueAction()`
(requirements → tx, one log line per step) and `useBlueMarket(chainId,
marketId, account)` (MNEMON id → MarketParams via `idToMarketParams` →
accrued market + position). Wallet chains live in `lib/web3/chains.ts`
(`CHAINS`, shared by `app/providers.tsx` and the action guard); Arc (5042)
has no public RPC yet so it stays read-only.

Three write surfaces (the third — `components/tools/mnemon/MarketActionPanel.tsx`,
Blue market lend/withdraw — is described in the MNEMON section):
1. **`components/vault/DepositPanel.tsx`** (~990 lines) — used by both vault
   pages. Props: `vaultAddress`, `v2` (only affects its internal metadata
   query), `initialAmount`/`initialMode` (from `?deposit=`/`?withdraw=` URL
   params). Approve→auto-deposit flow with receipt-hook + fallback polling.
   Transaction logs are **append-only** (do not reintroduce
   `setTransactionLogs([])` clears — reverted by request).
2. **Terminal CLI** in `app/terminal/page.tsx` `handleCommandSubmit`: `deposit`/
   `withdraw` and their `-v2` spellings are ONE command each, targeting
   MYRMIDONS_USDT0 (regex `^deposit(-v2)?\s+(.+)$`; lines are prefixed
   `VAULT_V2 // `). `balance`, `apr`, `tvl`, `vault stats` read the same vault.

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
named after the vaults), EREBUS=offline. Legacy `#file=strategy-usdt0` deep
links and the `hegemon` / `morpho` / `vault` aliases resolve to
MYRMIDONS_USDT0. The V2 tiles' `v2Meta` lookup
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

Market commands (2026-09-14, `MARKET_USAGE` + one block in
`handleCommandSubmit`): `lend` / `unlend` / `borrow … [collateral <amt>]` /
`repay … [withdraw <amt>]` / `position`, on any MNEMON market of the
wallet's chain. `<market>` = `COLL/LOAN[@LLTV]` or a market-id prefix
(`resolveMarketRef` in `lib/mnemon/aggregate.ts` — ambiguous pairs list
their LLTVs instead of guessing). They call the SAME rules as the
analyser panel — `buildBlueAction`, `shouldCloseAll`, `safeMaxBorrow`,
`safeWithdrawableCollateral` in `lib/web3/blue.ts` — so `max` semantics
match (shares on full unlend/repay). `markets <query>` is discovery
(pair / symbol / id-prefix, every indexed chain, FULL market id per row,
BROKEN / OTHER_CHAIN flags); `chain` lists the wallet chains
(`lib/web3/chains.ts` CHAINS, ● current) and `chain <name|id>` switches
via wagmi `useSwitchChain` (`resolveChainRef`: MNEMON labels/tags, viem
names, eth/hevm/arb shorthands). Output lines start `MARKET // ` or
`CHAIN // ` and go through the VAULT lines' status-word colouring in the
renderer (first word ERROR/REVERTED/REJECTED = red, *CONFIRMED / APPROVED
/ SWITCHED = green); the runner's log is rewritten status-word-first
("CONFIRMED  ERC20APPROVAL"). 64-hex tokens on these lines are MARKET IDS
(plain gold, `select-all`) unless the status word is *CONFIRMED — then a
tx hash linked via `explorerTxUrl(chainId, …)`, not the hardcoded
hyperevmscan the SWAP/VAULT lines still use. `unlend`, not `withdraw`:
that verb is the vault's.

## Strategy math on the pages

- `lib/strategy/adaptiveCurve.ts` (`STRATEGY_CONSTANTS`, U0 0.82) is the
  original HEGEMON curve; `computeMarketDecisions` from it still labels the
  V2 pages' allocation rows.
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

`ReallocatorTerminal` takes a `streamPath` prop, defaulting to
`/api/logs/hegemon-v2/stream` (proxy → `logs.myrmidons-strategies.com/v2/sse`,
env `LOG_STREAM_URL_V2`/`LOG_STREAM_TOKEN_V2`) — the only keeper stream the
site has. It also takes `vaultFilter` (a vault address): the V2 bot
runs several vaults on ONE stream, and since 2026-07-22 tags every per-vault
event with `vault` — the terminal drops structured events attributed to
another vault, while vault-agnostic lines (tick_start/tick_end) always pass. `VaultV2Page` passes its own address. The V2 bot emits JSONL tagged `bot: "HEGEMON_V2"`; the
`lib/logs/jsonl.ts` formatter renders V2-specific `plan.moves` (per-market flow
`out: kHYPE −2.10 → in: WHYPE +2.58`, weight before→after, simulated
`apy X→Y`, `liq→market` on rotation) and `tick_skip` reasons (churn / yield-gate
detail come straight from the bot's `reason` field). Events without `moves`
render as plain lines. Keep the `JsonlEvent.plan` type in sync with the
bot's `events.ts` payload. The bot's per-tick `scores` event (full market table,
for downstream ingestion like MNEMON) is **dropped** from the terminal in
`ReallocatorTerminal` (`evt.type === "scores"` early return) — too verbose for
humans; MNEMON consumes it off the raw SSE directly, not through this FE.

## Known gaps / deliberate state (as of 2026-07-17)

- The vault pages show a static IN DEV status KPI where a "last
  reallocation" card could sit; wiring one to the V2 stream is a follow-up
  (the old V1 card and its context were deleted with the V1 vault).
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
