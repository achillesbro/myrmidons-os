/**
 * One-off script to test Morpho vault history API for 1d vs 7d.
 * Run: node scripts/test-morpho-history.mjs
 */
const VAULT = "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42";
const CHAIN_ID = 999;
const GRAPHQL_URL = "https://api.morpho.org/graphql";

function getTimeRange(range) {
  const now = Math.floor(Date.now() / 1000);
  let startTimestamp, interval;
  switch (range.toLowerCase()) {
    case "1d":
      startTimestamp = now - 24 * 60 * 60;
      interval = "HOUR";
      break;
    case "7d":
      startTimestamp = now - 7 * 24 * 60 * 60;
      interval = "HOUR";
      break;
    default:
      startTimestamp = now - 7 * 24 * 60 * 60;
      interval = "HOUR";
  }
  return { startTimestamp, endTimestamp: now, interval };
}

async function fetchHistory(range) {
  const { startTimestamp, endTimestamp, interval } = getTimeRange(range);
  const body = {
    query: `
      query VaultHistory($address: String!, $chainId: Int!, $options: TimeseriesOptions!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          historicalState {
            netApy(options: $options) { x y }
            totalAssetsUsd(options: $options) { x y }
          }
        }
      }
    `,
    variables: {
      address: VAULT,
      chainId: CHAIN_ID,
      options: { startTimestamp, endTimestamp, interval },
    },
  };
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.errors) {
    console.error(`${range} errors:`, JSON.stringify(data.errors, null, 2));
    return null;
  }
  return data.data || data;
}

async function main() {
  console.log("Testing Morpho vault history for USDT0 (chain 999)...\n");
  for (const range of ["1d", "7d"]) {
    const result = await fetchHistory(range);
    if (!result) continue;
    const vault = result.vaultByAddress;
    const state = vault?.historicalState || {};
    const apy = state.netApy || [];
    const tvl = state.totalAssetsUsd || [];
    console.log(`${range.toUpperCase()}:`);
    console.log("  netApy points:", apy.length, apy.length ? "sample:" : "", apy.slice(0, 2));
    console.log("  totalAssetsUsd points:", tvl.length, tvl.length ? "sample:" : "", tvl.slice(0, 2));
    if (apy.length === 0 && range === "1d") {
      console.log("  Raw vaultByAddress keys:", Object.keys(vault || {}));
      console.log("  Raw historicalState:", JSON.stringify(state).slice(0, 500));
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
