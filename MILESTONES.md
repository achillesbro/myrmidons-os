# Myrmidons OS - Development Milestones

## ⚠️ Critical Constraints

**DO NOT:**
- Touch Morpho API or ABIs until Milestone 6-9
- Add raw CSS files (use tokens + Tailwind only)
- Couple UI layout to data before Milestone 6
- Skip acceptance tests before moving to next milestone

**Sequencing:**
- Get UI layout stable before wiring data (M1-M5)
- SSE logs (M10) are orthogonal and can be done after vault UI is stable
- Hardening (M12) should be done incrementally, not all at the end

---

## Milestone 0 — Repo bootstrap (runs locally)

**Status:** ✅ DONE

**Goal:** Clean Next.js TS app boots with your base layout.

**Tasks:**
- [x] Create Next.js (App Router) + TypeScript project
- [x] Add Tailwind, shadcn/ui baseline, lucide-react
- [x] Add font loading (IBM Plex Mono or JetBrains Mono) and CSS variables for your palette
- [x] Add a simple root layout with:
  - [x] background #0a1b34
  - [x] header slot
  - [x] main content slot

**Acceptance Tests:**
- [x] `pnpm dev` (or npm) renders `/` with correct background + header placeholder
- [x] No custom CSS besides tokens + Tailwind base

**Notes:**
- Base setup complete
- Design tokens initialized in `app/globals.css`

---

## Milestone 1 — Design tokens + core components (visually stable)

**Status:** ✅ DONE

**Goal:** Lock UI primitives so you never touch global CSS again.

**Tasks:**
- [x] Implement token mapping (--bg, --panel, --border, --gold, --success, --danger, --text)
- [x] Create components:
  - [x] Panel (bordered container)
  - [x] KpiCard
  - [x] AsciiCard (for algorithm cards)
  - [x] Tabs wrapper (Radix/shadcn)
  - [x] Badge, Button
- [x] Add `cn()` helper (clsx + tailwind-merge) and CVA variants for cards/buttons

**Acceptance Tests:**
- [x] `/ui` route (storybook-like page) showing all primitives in one screen
- [x] Zero layout shift / consistent borders / consistent typography

**Notes:**
- All components created with CVA variants
- `/ui` showcase page demonstrates all primitives
- Input component skipped (not needed yet)

---

## Milestone 1 — Design tokens + core components (visually stable)

**Status:** ✅ DONE

**Goal:** Lock UI primitives so you never touch global CSS again.

**Tasks:**
- [x] Implement token mapping (--bg, --panel, --border, --gold, --success, --danger, --text)
- [x] Create components:
  - [x] Panel (bordered container)
  - [x] KpiCard
  - [x] AsciiCard (for algorithm cards)
  - [x] Tabs wrapper (Radix/shadcn)
  - [x] Badge, Button
- [x] Add `cn()` helper (clsx + tailwind-merge) and CVA variants for cards/buttons

**Acceptance Tests:**
- [x] `/ui` route (storybook-like page) showing all primitives in one screen
- [x] Zero layout shift / consistent borders / consistent typography

**Files to create:**
- `components/ui/panel.tsx`
- `components/ui/kpi-card.tsx`
- `components/ui/ascii-card.tsx`
- `components/ui/tabs.tsx`
- `components/ui/badge.tsx`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `app/ui/page.tsx` (showcase route)

**Dependencies:**
- Install: `@radix-ui/react-tabs`, `class-variance-authority`, `lucide-react`

---

## Milestone 2 — Header + routing skeleton + wallet connect placeholder

**Status:** ✅ DONE

**Goal:** Pages + navigation work before any data.

**Tasks:**
- [x] Build header: top-left "MYRMIDONS" + logo placeholder, top-right connect button placeholder (not wired)
- [x] Add routes:
  - [x] `/` landing
  - [x] `/vaults/usdt0` vault page
  - [x] `/ui` style showcase remains
- [x] Add "Modules / Vaults / Portfolio" nav items (no content)

**Acceptance Tests:**
- [x] Clicking "USDT0 Morpho" card on landing navigates to `/vaults/usdt0`
- [x] Header stays consistent across routes

**Files to create:**
- `components/header.tsx`
- `app/page.tsx` (landing)
- `app/vaults/[slug]/page.tsx` (dynamic vault route)

**Notes:**
- Header created with logo, nav links, and placeholder connect button
- Landing page has terminal panel (left) and algorithms grid (right)
- Vault page includes KPIs, chart placeholder, deposit panel, allocations table, and tabs
- Module placeholder pages created (`/modules/arbitrage`, `/modules/liquidation`)
- Vaults index page created (`/vaults`)

---

## Milestone 3 — RainbowKit + wagmi + viem wiring (connect & chain state)

**Status:** ✅ DONE

**Goal:** Wallet connect works end-to-end.

**Tasks:**
- [x] Add RainbowKit/wagmi providers at root
- [x] Configure target chain(s) (Base + HyperEVM as needed; at minimum one chain to test)
- [x] Implement connect button in header
- [x] Show connected address short-form in header (like your mock)

**Acceptance Tests:**
- [x] Can connect/disconnect wallet in browser
- [x] Address renders correctly; no console errors

**Dependencies:**
- Install: `@rainbow-me/rainbowkit`, `wagmi`, `viem`, `@tanstack/react-query`

**Files to modify:**
- `app/layout.tsx` (add providers)
- `components/header.tsx` (wire connect button)

**Notes:**
- Created `app/providers.tsx` with WagmiProvider, QueryClientProvider, and RainbowKitProvider
- Base mainnet configured; HyperEVM added as TODO comment
- Header moved to `components/site/Header.tsx` as client component
- Added mounted check to prevent SSR issues with wallet hooks
- Webpack config updated to ignore optional dependencies (`@react-native-async-storage/async-storage`, `pino-pretty`)
- RainbowKit CSS imported in `globals.css`

---

## Milestone 4 — Landing page "Algorithms dashboard" (placeholder data)

**Status:** ✅ DONE

**Goal:** Landing page matches your product structure.

**Tasks:**
- [x] Left: "Terminal / Live feed" panel (placeholder log lines)
- [x] Right: grid of algorithm cards:
  - [x] Live: "Morpho Reallocator — USDT0"
  - [x] Future: "Arbitrage", "Liquidation Protection"
- [x] Cards have statuses (ACTIVE / SOON) and consistent layout

**Acceptance Tests:**
- [x] Landing page is responsive (desktop-first, but doesn't break on narrow width)
- [x] USDT0 card links to vault page; other cards can route to `/modules/*` placeholders or do nothing for now

**Files to create/modify:**
- `app/page.tsx` (full landing layout)
- `components/terminal-panel.tsx` (placeholder)
- `components/algorithm-card.tsx` (reuse AsciiCard)

**Notes:**
- Implemented as part of Milestone 2
- Terminal panel shows placeholder log lines with color-coded severity
- Algorithm cards use AsciiCard component with status badges

---

## Milestone 5 — Vault page layout (100% placeholders, correct composition)

**Status:** ⏳ PENDING

**Goal:** The vault page looks like the target UI without real data.

**Tasks:**
- [x] Top row: 3–4 KPI panels side-by-side (TVL, Net APY, 24h yield, Risk)
- [x] Middle: chart panel (wide) + deposit panel (right)
- [x] Lower: allocations table
- [x] Inner tabs: "Overview" and "Strategy" (strategy shows placeholder sections)

**Acceptance Tests:**
- [x] Vault page renders with no data dependencies
- [x] Tabs switch without rerender glitches
- [x] Layout matches: KPIs on top, chart below, deposit box right of chart, allocations below, strategy tab exists

**Files to create/modify:**
- `app/vaults/[slug]/page.tsx` (full layout)
- `components/vault/kpi-row.tsx`
- `components/vault/chart-panel.tsx` (placeholder)
- `components/vault/deposit-panel.tsx` (placeholder)
- `components/vault/allocations-table.tsx` (placeholder)

**Notes:**
- Implemented as part of Milestone 2
- All components integrated directly into vault page
- Strategy tab includes placeholder sections for parameters, last run summary, and execution history

---

## Milestone 6 — Morpho API integration via Next Route Handlers (server proxy)

**Status:** ⏳ PENDING

**Goal:** Real data available with caching + schema validation.

**Tasks:**
- [ ] Add `/api/morpho/*` route handlers:
  - [ ] `vault-metadata`
  - [ ] `vault-allocations`
  - [ ] `vault-apy` (or whatever Morpho endpoints you use)
- [ ] Implement fetchers with:
  - [ ] environment variable for base URL / key if needed
  - [ ] caching strategy (revalidate/TTL)
  - [ ] Zod validation of responses

**Acceptance Tests:**
- [ ] Hitting `/api/morpho/vault-metadata?address=...` returns validated JSON
- [ ] Errors are typed and user-safe (no stack traces)
- [ ] Works in dev without CORS issues (because proxy)

**Dependencies:**
- Install: `zod`

**Files to create:**
- `app/api/morpho/vault-metadata/route.ts`
- `app/api/morpho/vault-allocations/route.ts`
- `app/api/morpho/vault-apy/route.ts`
- `lib/morpho/schemas.ts` (Zod schemas)
- `lib/morpho/fetcher.ts` (shared fetch logic)

---

## Milestone 7 — Client data layer (TanStack Query) + render real metrics

**Status:** ⏳ PENDING

**Goal:** UI consumes real Morpho data cleanly.

**Tasks:**
- [ ] Add React Query provider (if not already in M3)
- [ ] Implement hooks:
  - [ ] `useVaultMetadata(address)`
  - [ ] `useVaultAllocations(address)`
  - [ ] `useVaultApy(address)`
- [ ] Populate KPI cards and allocations table from real responses
- [ ] Keep skeleton loading states consistent with your UI

**Acceptance Tests:**
- [ ] Vault page shows real TVL/APY/allocations for USDT0 vault address
- [ ] Refreshing page does not spam network (query caching works)
- [ ] Loading states appear then resolve cleanly

**Files to create:**
- `lib/hooks/use-vault-metadata.ts`
- `lib/hooks/use-vault-allocations.ts`
- `lib/hooks/use-vault-apy.ts`
- `components/vault/skeleton-loading.tsx` (if needed)

---

## Milestone 8 — Chart implementation (real series, minimal complexity)

**Status:** ⏳ PENDING

**Goal:** Chart renders meaningful time series.

**Tasks:**
- [ ] Add chart component using Recharts
- [ ] Create `/api/morpho/vault-history` (or compose from Morpho endpoints) returning time series
- [ ] Show timeframe toggles (1D/7D/30D/ALL) like your mock (even if only 7D works initially)

**Acceptance Tests:**
- [ ] Chart renders with real data points
- [ ] Switching timeframe refetches (or uses cached) correctly
- [ ] No layout overflow; tooltip works

**Dependencies:**
- Install: `recharts`

**Files to create/modify:**
- `app/api/morpho/vault-history/route.ts`
- `components/vault/chart-panel.tsx` (replace placeholder)
- `components/vault/timeframe-toggle.tsx`

---

## Milestone 9 — Deposit/Withdraw wiring (minimal ABI calls)

**Status:** ⏳ PENDING

**Goal:** Basic onchain interaction works with guardrails.

**Tasks:**
- [ ] Add vault ABI sample (deposit/withdraw)
- [ ] Implement deposit box:
  - [ ] amount input
  - [ ] "Deposit" button
  - [ ] "Withdraw" button (simple flow)
- [ ] Add chain checks (wrong network prompt)
- [ ] Add transaction states (idle → signing → pending → confirmed/failed)

**Acceptance Tests:**
- [ ] On a test vault (or controlled environment), deposit/withdraw calls trigger wallet tx
- [ ] UI shows tx hash + pending/confirmed states
- [ ] Wrong chain blocks execution with a clear UI message

**Files to create:**
- `lib/abis/vault.ts` (or similar)
- `lib/hooks/use-deposit.ts`
- `lib/hooks/use-withdraw.ts`
- `components/vault/deposit-panel.tsx` (replace placeholder with real form)

---

## Milestone 10 — Reallocator logs: real-time stream into left terminal panel

**Status:** ⏳ PENDING

**Goal:** Live logs panel works end-to-end.

**Tasks:**
- [ ] Implement `/api/logs/stream` as SSE
- [ ] Decide log source:
  - [ ] dev mode: mock generator
  - [ ] prod-like: read from a file/socket/HTTP endpoint exposed by your VPS bot (recommended: bot exposes its own SSE endpoint; frontend proxies it)
- [ ] Implement client terminal component:
  - [ ] append lines, cap buffer (e.g., last 500 lines)
  - [ ] severity coloring (INFO/WARN/ERR using your palette)

**Acceptance Tests:**
- [ ] In dev, log stream updates every second
- [ ] Disconnect/reconnect works (SSE auto-reconnect)
- [ ] Buffer cap prevents memory growth

**Files to create:**
- `app/api/logs/stream/route.ts`
- `components/terminal-panel.tsx` (replace placeholder)
- `lib/hooks/use-log-stream.ts`

---

## Milestone 11 — Vault "Strategy" tab: detailed breakdown + execution log placeholders

**Status:** ⏳ PENDING

**Goal:** Structure for deeper inspection without building the entire analytics suite now.

**Tasks:**
- [ ] Add sections:
  - [ ] parameters (min improvement bps, rebalance frequency, slippage)
  - [ ] "Last run summary" panel (placeholder)
  - [ ] execution history table (placeholder)
- [ ] Add a second tab row if needed (Overview vs Strategy, then inside Strategy: Params / History)

**Acceptance Tests:**
- [ ] Strategy tab exists and is navigable
- [ ] Components are reusable; no duplicated layout code

**Files to create/modify:**
- `components/vault/strategy-tab.tsx`
- `components/vault/strategy-params.tsx`
- `components/vault/execution-history.tsx`

---

## Milestone 12 — Hardening + repo hygiene (so you don't regress into chaos)

**Status:** ⏳ PENDING

**Goal:** Enforce consistency and prevent CSS entanglement.

**Tasks:**
- [ ] Biome (or ESLint/Prettier) + lint-staged + Husky
- [ ] Directory conventions:
  - [ ] `app/` pages
  - [ ] `components/` UI + domain
  - [ ] `lib/` fetchers/web3
  - [ ] `styles/` only tokens
- [ ] Add "no raw CSS files" rule (optional) and keep Tailwind config tidy

**Acceptance Tests:**
- [ ] `pnpm lint` and `pnpm format` pass
- [ ] Fresh clone → install → dev works in one command

**Dependencies:**
- Install: `@biomejs/biome` (or ESLint/Prettier), `lint-staged`, `husky`

**Files to create:**
- `.biome.json` (or `.eslintrc`, `.prettierrc`)
- `.lintstagedrc`
- `.husky/pre-commit`

---

## Progress Summary

- **Completed:** 6/12 (50%)
- **In Progress:** 0/12
- **Pending:** 6/12 (50%)

**Current Focus:** Milestone 6 — Morpho API integration via Next Route Handlers

---

## Notes

- Update this file as you complete tasks
- Mark acceptance tests as you verify them
- Add blockers or deviations in the Notes section of each milestone
- Keep branch names aligned: `milestone/N-description`

