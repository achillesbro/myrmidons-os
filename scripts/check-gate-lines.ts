// Self-check for the GATES panel builders and the signed oracle deviation
// tone (lib/mnemon/format.ts). No framework:
//   pnpm dlx tsx scripts/check-gate-lines.ts
import assert from "node:assert/strict";
import {
  gateFooter,
  investableGateRows,
  investableWarningLines,
  oracleDevTone,
} from "../lib/mnemon/format";
import type { MarketHealthEntry } from "../lib/mnemon/schemas";

// wsNET/USDG 62.5% on Robinhood, 2026-09-29 export — the market that
// motivated the rewording.
const wsnet = {
  available_usd: 113.8,
  apy_at_target: 0.3004,
  oracle_deviation: -0.1108,
  investable_reasons: ["exit_liquidity", "exit_regime", "high_rate", "liquidatable"],
  investable_warnings: ["lender_exit_shock", "lltv_buffer_below_cutoff", "lender_majority"],
  supplier_concentration: { top1_supply_pct: 0.495 },
  investable_inputs: {
    deposit_usd: 50_000,
    lif: 1.1268,
    at_risk_cutoff: 0.6193,
    at_risk_debt_usd: 642_566,
    dex_rung_usd: 1_000_000,
    dex_rung_slippage: null,
    has_dex_route: true,
    util_after_top1_exit: 1.7414,
    bad_debt_30d_usd: 0,
    pinned_frac_7d: 0.1784,
    days_observed: 68.54,
  },
} as unknown as MarketHealthEntry;

const rows = Object.fromEntries(investableGateRows(wsnet).map((r) => [r.code, r]));
assert.equal(Object.keys(rows).length, 7);
assert.deepEqual(rows.track_record, { code: "track_record", reading: "68.5 d", limit: "≥ 7 d", verdict: "PASS" });
assert.deepEqual(rows.exit_liquidity, { code: "exit_liquidity", reading: "$114", limit: "≥ $50.0k", verdict: "FAIL" });
assert.deepEqual(rows.exit_regime, { code: "exit_regime", reading: "17.8% of 7d", limit: "≤ 10%", verdict: "FAIL" });
assert.deepEqual(rows.high_rate, { code: "high_rate", reading: "30.0% @target", limit: "≤ 15%", verdict: "FAIL" });
// Oracle BELOW the cross passes; the sign is kept in the reading.
assert.deepEqual(rows.oracle_overprice, { code: "oracle_overprice", reading: "−11.1%", limit: "≤ +2%", verdict: "PASS" });
assert.deepEqual(rows.bad_debt, { code: "bad_debt", reading: "$0 / 30d", limit: "< 10 bps", verdict: "PASS" });
// Null Relay slippage = no quote: UNVERIFIED, never FAIL. Limit is 80% of the bonus, concrete.
assert.deepEqual(rows.liquidatable, { code: "liquidatable", reading: "no quote @ $1.00M", limit: "≤ 10.1%", verdict: "UNVERIFIED" });

// A quoted rung renders the slippage and fails/passes on the server's word.
const quoted = investableGateRows({
  ...wsnet,
  investable_inputs: { ...wsnet.investable_inputs, dex_rung_slippage: 0.12 },
} as MarketHealthEntry).find((r) => r.code === "liquidatable")!;
assert.deepEqual(quoted, { code: "liquidatable", reading: "12.0% @ $1.00M", limit: "≤ 10.1%", verdict: "FAIL" });

// Redemption-only collateral skips the two DEX gates.
const skipped = investableGateRows({
  ...wsnet,
  investable_reasons: [],
  investable_warnings: ["redemption_only_collateral"],
} as MarketHealthEntry);
assert.equal(skipped.find((r) => r.code === "liquidatable")!.verdict, "SKIPPED");
assert.equal(skipped.find((r) => r.code === "oracle_overprice")!.verdict, "SKIPPED");
assert.equal(skipped.find((r) => r.code === "exit_liquidity")!.verdict, "PASS");

// No gate view at all: every row unverified.
assert.ok(
  investableGateRows({ ...wsnet, investable_reasons: ["unverified"], investable_inputs: null } as MarketHealthEntry).every(
    (r) => r.verdict === "UNVERIFIED"
  )
);

assert.equal(gateFooter(wsnet), "debt at risk $642.6k · liquidation bonus 12.7% · bad-day cutoff 62%");

// Warnings: noise codes dropped, exit shock inverted into a covered share.
const warns = investableWarningLines(wsnet);
assert.deepEqual(warns.map((l) => l.code), ["lender_exit_shock"]);
assert.equal(warns[0].detail, "top lender 49.5%, rest covers 57% of debt");

// Signed deviation: below the cross never colours.
assert.equal(oracleDevTone(-0.11), "default");
assert.equal(oracleDevTone(0.01), "default");
assert.equal(oracleDevTone(0.03), "gold");
assert.equal(oracleDevTone(0.05), "danger");
assert.equal(oracleDevTone(null), "default");

console.log("check-gate-lines: ok");
