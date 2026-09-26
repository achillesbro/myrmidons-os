# myrmidons-os — LLM working notes

Frontend of myrmidons-strategies.com. Next.js 15 (App Router) + TypeScript +
Tailwind + wagmi/viem/RainbowKit + TanStack Query + recharts. Deployed on
Vercel from `main`. `pnpm install && pnpm dev` (dev CSS compilation requires
the ESM tailwind config — never use `require()` in `tailwind.config.ts`).

## What this site is

A terminal-styled dashboard for MYRMIDONS strategies. **We are on EIGHT
chains**: MNEMON indexes every Morpho market on HyperEVM, Robinhood,
Arbitrum, Katana, Monad, Ethereum, Base and Arc (`MNEMON_CHAINS` in
`lib/mnemon/format.ts`, the single source — site copy, docs and CLAUDE.md
must all say eight, and grow with that list). The wallet can write on all
eight (`CHAINS` in `lib/web3/chains.ts` — Arc joined 2026-09-25 via
rpc.mainnet.arc.io; its native gas is USDC). The vaults themselves live on
HyperEVM (chainId 999):

- **HEGEMON_V2** — in-dev Morpho Vault V2 reallocator, ONE bot process running
  THREE vaults: USDT0 ("Test MYRMIDONS V2"), USDC ("MYRMIDONS USDC", added
  2026-07-22) and WHYPE ("MYRMIDONS WHYPE", added 2026-08-25). Bot repo:
  github.com/achillesbro/HEGEMON_V2 (spec: HEGEMON_V2_STRATEGY_SPEC.md there).
- **EREBUS** — private liquidation engine. Not maintained: HIDDEN from the
  terminal's filesystem since 2026-09-26 (no tile, no alias, no `open`);
  its page `/modules/liquidation` and the `StrategiesWindowContent`
  screen for `strategy-liq-protect` are kept, just unreachable.

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
| `/` (`app/page.tsx` → `components/landing/LandingPage.tsx`) | Landing/explainer: hero + loop + MNEMON/HEGEMON sections with live KPIs, best-market `MnemonMarketDrilldown`, embedded `ReallocatorTerminal` live feed, a one-paragraph STATUS section (experimental; Morpho's vault contracts audited, everything of ours above them not — the service/scope table it replaced on 2026-09-25 duplicated the strategies pane and the hero), contact. Redirects legacy `/#file=`/`/#tool=` deep links to `/terminal`. |
| `/terminal` (`app/terminal/page.tsx`, ~4k lines) | The OS: CLI terminal + strategies/tools floating panes. All CLI commands live here (report formatting in `lib/terminal/`). Site `Header` hides on `/` and `/terminal`. Seen through a CRT tube with retro-PC sounds (see "CRT tube + SFX"). |
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
`explorer: null` (none today; Arc got explorer.arc.io on 2026-09-16)
renders tx/address links as plain text.
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
(`projectionTimestamp` = max(now, lastUpdate) + 2h + `SUBMIT_MARGIN_S`
(10 min) — the SDK validates at +2h from the moment the tx is BUILT, we
preview earlier; a shorter horizon under-counts the dust and the SDK
refuses what the panel promised). The 2026-09-14 field failure
("Withdrawing … collateral would make position unhealthy … Actual Borrow
assets: 51") was exactly this: repay-first is correct, the 51 units were
accrued interest; the 2026-09-25 fork run then failed by 6 units over a
ONE-SECOND preview→build gap (~7 units/s of interest on a 2k debt), hence
the margin. `projectPosition`'s repay leg runs the entity's own `repay()`
simulation (assets→shares rounded DOWN) because that is the position the
guard checks. **Fork check:** `scripts/fork-blue-bundles.ts` (anvil fork
of any wallet chain, `pnpm dlx tsx`, header has the three commands)
drives lend / unlend ×2 / collateral+borrow / partial repay+withdraw /
close-all through the SAME `buildBlueAction` + `runBlueAction` and
asserts every tx targets BlueBundlesV1 and the position ends at zero.
Run it on HyperEVM (classic approvals) AND Base (Permit2 signatures)
after touching blue.ts or bumping the SDK, with a FRESH mnemonic: anvil's
default #0 key carries an EIP-7702 delegation on Base, which sends
Permit2 down the ERC-1271 path and reverts. Arc CANNOT be forked: its
native-USDC ERC-20 (0x3600…) delegates to a precompile at 0x1800… that
anvil lacks (OpcodeNotFound), so every USDC transfer reverts under anvil —
Arc writes ride the same code path proven on Base. TX_LOGS is absolutely positioned inside its column so a long
log scrolls instead of growing the row. All writes
go through `runBlueAction`: classic approve tx, one-time BlueBundlesV1
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
"zero"). Whole eight-chain scan ≈ 1s. USD are ESTIMATES: loan price =
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
functions work for all three vaults**; only the address differs. Decimals are
always read on-chain (share decimals 18; asset 6 for USDT0/USDC, 18 for WHYPE).

**Morpho Blue markets (MNEMON drill-down lend/borrow, 2026-09-14)** are NOT
ERC-4626: writes go through `@morpho-org/morpho-sdk` **v6** (since
2026-09-25 — every Blue write is one direct call to the chain's
`bundles.blueBundlesV1` contract; Bundler3/GeneralAdapter1 are deprecated
and gone from the SDK's registry). The SDK owns the per-chain addresses,
approvals (spender = BlueBundlesV1), Morpho authorizations (operator =
BlueBundlesV1), share math and the required `deadline` (`blueDeadline()`,
20 min). Bundles are registered on all eight wallet chains.
Signature support (Permit2 SignatureTransfer + signed Morpho
authorization) is gated PER CHAIN by `blueSignaturesSupported` = canonical
Permit2 in the SDK registry: on (Base, mainnet, Arbitrum, Monad,
Robinhood, Arc) it is a one-time max approval to Permit2 then signature +
one tx per action; off (HyperEVM, Katana) it is an exact approval tx to
BlueBundlesV1 before every funded action. `lib/web3/blue.ts` is
the seam: `blueActionsSupported(chainId)`, `blueMarket()`, `runBlueAction()`
(requirements → tx, one log line per step) and `useBlueMarket(chainId,
marketId, account)` (MNEMON id → MarketParams via `idToMarketParams` →
accrued market + position). Wallet chains live in `lib/web3/chains.ts`
(`CHAINS`, shared by `app/providers.tsx` and the action guard) and must
cover every `MNEMON_CHAINS` entry.

Three write surfaces (the third — `components/tools/mnemon/MarketActionPanel.tsx`,
Blue market lend/withdraw — is described in the MNEMON section):
1. **`components/vault/DepositPanel.tsx`** (~990 lines) — used by both vault
   pages. Props: `vaultAddress`, `v2` (only affects its internal metadata
   query), `initialAmount`/`initialMode` (from `?deposit=`/`?withdraw=` URL
   params). Approve→auto-deposit flow with receipt-hook + fallback polling.
   Transaction logs are **append-only** (do not reintroduce
   `setTransactionLogs([])` clears — reverted by request).
2. **Terminal CLI** in `app/terminal/page.tsx` `handleCommandSubmit`: `deposit`/
   `withdraw` and their `-v2` spellings are ONE command each, `<amt|max|half>
   [usdt0|usdc|whype]` (regex `^deposit(-v2)?\s+(\S+)(?:\s+(\S+))?$`; lines
   are prefixed `VAULT_V2 // `, a `TARGET` line names the vault). The vault
   is the one named, else the SLOTTED SHARD's, else USDT0 (`resolveVaultRef`
   in `lib/terminal/vaults.ts` — owner call, 2026-09-26). `balance` reads
   shares in all three; `apr`, `tvl`, `vault stats`, `alloc`, `nav`, `tail`
   take the same `[vault]`.

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
named after the vaults). Legacy `#file=strategy-usdt0` deep
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
side-effects; returns out / links / chart entries), `handleCommandSubmit`
(async/writes; its head does `!!`, `&&` and alias expansion first),
`SUGGEST_POOL` (also the Tab-completion pool), `REPORT_CMDS` (commands
whose output is a report: coloured by meaning, never wraps — see "Terminal
commands beyond navigation"), `HIGHLIGHT_TERMS` (the older per-command
gold terms, still used for nav/swap/vault lines), `help` + `help <topic>`,
the `lineKind` status words (error buzz / ok chirp) and the cwd-aware
mobile chips. `CHANGELOG` in `lib/terminal/report.ts` is what `version`
and `changelog` print — add a row when something ships.

Market commands (2026-09-14, `MARKET_USAGE` + one block in
`handleCommandSubmit`): `lend` / `unlend` / `borrow … [collateral <amt>]` /
`repay … [withdraw <amt>]` / `position`, on any MNEMON market of the
wallet's chain. `<market>` = `COLL/LOAN[@LLTV]` or a market-id prefix
(`resolveMarketRef` in `lib/mnemon/aggregate.ts` — ambiguous pairs list
their LLTVs instead of guessing). They call the SAME rules as the
analyser panel — `buildBlueAction`, `shouldCloseAll`, `safeMaxBorrow`,
`safeWithdrawableCollateral` in `lib/web3/blue.ts` — so `max` semantics
match (shares on full unlend/repay). `markets [query] [flags]` is
discovery (pair / symbol / id-prefix, every indexed chain, a table with
the id per row shown short and copyable — the full id is in the log text
and the shown prefix resolves everywhere — and BROKEN / NOT_INVESTABLE /
OTHER_CHAIN flags); `chain` lists the wallet chains as a table
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

## Terminal commands beyond navigation (2026-09-26)

Read commands format through `lib/terminal/report.ts` (framework-free:
`statusLines`, `allocLines`, `marketCard`, `topLines`, `marketsLines` +
`parseMarketsArgs`, `navLines`/`lineChart`, `CHANGELOG`,
`resolveMarketAnywhere`); vault refs through `lib/terminal/vaults.ts`
(`VAULTS`, `resolveVaultRef`: the vault named, else the SLOTTED SHARD's,
else USDT0 — owner call); watches and aliases through
`lib/terminal/watch.ts` (localStorage `myrmidons.watch` / `.alias`). The
page holds one `useVaultBundle` per vault (KPIs, allocations, 30d
history) plus `useRiskMarkets` and `useMarketFlows`, and passes them to
`runCommand` via opts.
- Vaults: `vault stats|apr|tvl|alloc|nav [vault]`, `deposit|withdraw
  <amt> [vault]`, `balance` (all three), `tail [vault]` (the HEGEMON_V2
  SSE into the log, same normalizers as `ReallocatorTerminal`; `q`/Esc
  stop; prefix `FEED // `).
- Markets: `markets [query] --chain --loan --sort --n --investable`,
  `market <ref>` (drill-down card: RATES/BOOK/RISK/COLLATERAL/ORACLE/
  FLOWS/GATES, risk metrics from the risk API), `top [loan] [chain]`.
- System: `status` is live (index age, per-chain counts, vault TVLs,
  wallet chain/block/gas); `block|gas [chain]` read another chain via a
  one-off viem client; `rpc`/`ping` follow the wallet chain; `tx <hash>`
  reads the receipt; `permissions` says what the wallet can do here;
  `version`/`changelog` come from `CHANGELOG` (keep it current).
- Shell: `alias`/`unalias`, `!!`, `a && b` (dispatched in order, async
  ones overlap), `watch <target> <metric> <op> <value>` (edge-triggered,
  evaluated in an effect on data refresh, rings beep+chirp, prefix
  `WATCH // `), `export` (session log download).
- Removed: `hint`, `suggest`; `commands`/`?` are `help`. The status-word
  colouring recognises the new prefixes (WATCH/FEED/TX/ALIAS/EXPORT) and
  SUCCESS/LIVE/ARMED/SAVED (green), WARN/ALERT (gold).
- Report outputs (`REPORT_CMDS` in the page: help, status, alloc, nav,
  market, top, watch, permissions, ls…) render through
  `lib/terminal/report-highlight.ts` — colour is RARE, like the site's
  panels: white for headings, row labels, table headers and a row's
  identity (pair, vault); green/red for states only; gold for warnings
  and for the command column of help lines; numbers stay dim. Report
  lines are `whitespace-pre` (tables never wrap; the log scrolls
  sideways). `man` keeps its own prose pass. Tables everywhere a list is
  a list: markets, top, alloc, status, portfolio (VAULTS / LENDS /
  BORROWS), chain, balance vaults, watch, alias, history, changelog. A
  full 64-hex market id in a report line renders as `CopyId`
  (`components/terminal/CopyId.tsx`: shown 12 chars + …, click copies
  the whole id, tooltip shows it) and counts 13 cells in `table()`; the
  log text keeps the full id, so export / select-all carry it and every
  ref resolver accepts the shown prefix. A `PREFIX // ` line keeps
  the status-word path, so its 64-hex tokens stay market ids (no
  explorer link) unless the word is *CONFIRMED. Tables come from
  `table()` in report.ts: white header, ASCII `-` rule, aligned columns
  (NBSP via `hard`). NO box-drawing glyphs anywhere in the log: the
  page's Plex Mono is Google's latin subset, its fallback draws `─│┼`
  1.4-1.6 cells wide (measured), so `tail` transliterates the bot's
  console.table to `-|+`. `nav` prints summaries plus `chart` log
  entries (`TerminalChartEntry`, one reveal step each) drawn by
  `components/terminal/TerminalChart.tsx` — recharts, gold line, Plex
  ticks, no animation (it would re-run the CRT filter every frame).

## CRT tube + SFX (`/terminal` only, 2026-09-25)

The page's default export is `<CrtScreen><TerminalOS /></CrtScreen>`
(`components/chrome/CrtScreen.tsx`). The terminal renders through an SVG
`feDisplacementMap` barrel warp over the WHOLE picture (edge-only curvature
was tried and rejected). The warp is supersampled (4 taps, 2 on a 2x
display) because Chrome samples it nearest-neighbour, and one tap breaks
strokes. **Perf rule:** nothing animated inside the filtered subtree and no
blend-mode overlay on top of it, since either one re-runs the filter every
frame. So the roll band sits in `.crt-fx` in plain alpha, the caret trace
and a pane's pulsing dots step, tile scanline drift is off in the tube, and
beam/degauss unmount after power-on. The look is a healthy 1990 monitor,
not a VHS recording: no grain, no flicker dips, rounded tube corners, a
phosphor warm-up (brightness ramps over the first 2.6s), a chunky pixel
arrow for the mouse. The degauss is the teaser shader's hue field
(`paintDegauss`, same math) on two canvases blended multiply +
plus-lighter BESIDE `.crt-screen` (inside `.crt-fx` a blend mode only sees
that layer's transparent backdrop, and `.crt-power` is opaque black for
the same reason), plus an R/B fringe in a second filter used only while
the power-on runs. `exit` at the FS root powers the tube off
(`powerOffCrt`, picture collapses to a dot) before leaving for `/`.
`[ CRT ON|OFF ]` next to SFX turns the tube off per browser
(`crtEnabled`, event `myrmidons:crt`). The warp is visual only: hit-testing
stays flat, so `remapPointer` replays pointerdown/up, click and dblclick
on the element the tube shows under the cursor (`unwarp`, the filter's own
p + D(p)) and moves focus by hand; events already over the right element
pass through untouched. The warp's pixel offset is capped
(`MAX_WARP_PX` 48, a laptop's) so a 1440p monitor is not warped and
resampled harder than a MacBook. It is off below md and with `?crt=0`. The
global `Scanlines` hides while `html[data-crt]` is set.
Sounds live in `lib/terminal/sfx.ts`: the teaser's retro-PC instruments,
synthesized into AudioBuffers in the browser (no audio files). Each one is
tied to its animation:
- power-on: switch, spin-up, CRT thump, degauss; then the fans + spindle
  loop as a quiet bed (`startHum`/`stopHum`, a 2s seamless loop) until
  the page powers off or unmounts
- boot: a caret blinks alone for ~1.5s, then the emblem (`/brand/
  myrmidons-logo.svg`, the rows' height, left of the wordmark) wipes in
  with the rows; boot lines: disk seek, POST beep, static on the wordmark
- typed lines and the operator's keys: keyboard thock; Tab completion ticks
- status lines (`lineKind`): ERROR / *REVERTED / *REJECTED and "no such…"
  buzz the PC speaker, *CONFIRMED / APPROVED / SWITCHED chirp it
- panes: relay + drive whirr, spin-down on close
- shards: latch + a struck-metal ping on slot, latch + spring twang on
  eject, a soft drive tick per field as the screen glitches in
  (`useStaggeredReveal` in both panes)
- `clear`: the picture collapses (static sweeping down + thump); `exit`
  at the root: zap + switch as the tube powers off

SFX is ON by default; `[ SFX ON|OFF ]` in the status bar persists per
browser. Browsers refuse audio until the page gets a click or key press,
so a direct load or reload waits in STANDBY ("press any key to power on").
TerminalOS mounts only at power-on, so the boot starts with it. Arriving
from the landing's BOOT TERMINAL click, being muted, or being below md all
skip the standby.

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

- Terminal (2026-09-26): `nav` serves only the 30d history the page keeps
  (`7d`/`90d` say so); `tail`'s vault scoping of the bot's PLAIN score
  blocks is a heuristic (the "scores for 0x…" header opens a block, the
  next JSON event closes it); `a && b` dispatches both at once, so async
  writes can overlap; `portfolio`'s tables were typechecked, not run with
  a wallet; `tail` only proves itself where the stream token exists
  (Vercel), a local dev server has none and the feed closes at once.
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
- Emblem (scanline helmet): every version lives in `public/brand/` (shareable
  at `/brand/…`). The site renders the raw `myrmidons-logo.svg` (gold bars
  only, transparent) under the logo filter `brightness(2)` + `--gold`
  drop-shadows 6px/55% and 14px/30%; `-glow` / `-glow-navy` bake that filter
  in; the favicon is `-glow-navy-512.png`. PNGs (512/1024/2048) regenerate
  with `scripts/export-logo.sh`. Navy between the bars is never part of the
  design (it was a cutout artifact of the old PNG, removed 2026-09-25).
- Branch + PR for features; owner reviews before Vercel deploy from `main`.
- If `next dev` fights over ports/stale code: kill all `next dev`, `rm -rf .next`.
