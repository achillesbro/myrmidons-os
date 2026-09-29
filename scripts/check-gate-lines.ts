// Self-check for the NOT_INVESTABLE banner builders and the signed oracle
// deviation tone (lib/mnemon/format.ts). No framework:
//   pnpm dlx tsx scripts/check-gate-lines.ts
import assert from "node:assert/strict";
import {
  investableGateLines,
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
    at_risk_debt_usd: 642_566,
    dex_rung_usd: 1_000_000,
    dex_rung_slippage: null,
    has_dex_route: true,
    util_after_top1_exit: 1.7414,
    pinned_frac_7d: 0.1784,
  },
} as unknown as MarketHealthEntry;

const gates = investableGateLines(wsnet);
assert.deepEqual(
  gates.map((l) => l.code),
  ["exit_liquidity", "exit_regime", "high_rate", "liquidatable"]
);
assert.equal(gates[0].detail, "$114 available, floor $50.0k");
assert.equal(gates[1].detail, "above 99% util for 17.8% of 7d, limit 10%");
assert.equal(gates[2].detail, "30.0% at target, limit 15%");
// Null Relay slippage = no quote, never "cannot be sold".
assert.match(gates[3].detail, /^unverified, no Relay quote at \$1\.00M/);
assert.doesNotMatch(gates[3].detail, /—/);

// Quoted rung renders the slippage against the bonus.
const quoted = investableGateLines({
  ...wsnet,
  investable_reasons: ["liquidatable"],
  investable_inputs: { ...wsnet.investable_inputs, dex_rung_slippage: 0.12 },
} as MarketHealthEntry);
assert.equal(quoted[0].detail, "12.0% slippage at $1.00M, limit 80% of the bonus · debt at risk $642.6k · bonus 12.7%");

// Warnings: noise codes dropped, exit shock inverted into a covered share.
const warns = investableWarningLines(wsnet);
assert.deepEqual(warns.map((l) => l.code), ["lender_exit_shock"]);
assert.equal(warns[0].detail, "top lender holds 49.5%; remaining supply covers 57% of the debt");
assert.equal(warns[0].warn, true);

// Signed deviation: below the cross never colours.
assert.equal(oracleDevTone(-0.11), "default");
assert.equal(oracleDevTone(0.01), "default");
assert.equal(oracleDevTone(0.03), "gold");
assert.equal(oracleDevTone(0.05), "danger");
assert.equal(oracleDevTone(null), "default");

console.log("check-gate-lines: ok");
