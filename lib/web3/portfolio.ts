import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
import { blueAbi } from "@morpho-org/morpho-sdk/blue/abis";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/blue/fetch";
import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
import { CHAINS } from "./chains";
import { MNEMON_CHAINS, chainOf } from "@/lib/mnemon/format";
import { isInvestable, isRealMarket } from "@/lib/mnemon/aggregate";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { accruedDebt, blueMarket, type BlueMarketData, type BluePositionData } from "./blue";
import { readAssetMeta, type AssetMeta } from "./vault";
import { ERC20_ABI } from "./abis/erc20";
import { ERC4626_ABI } from "./abis/erc4626";
import { formatAmount } from "./format";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  WHYPE_V2_VAULT_ADDRESS,
} from "@/lib/constants/vaults";

// One wallet's positions across the MYRMIDONS vaults and every MNEMON Blue
// market, read straight from chain (no indexer): one multicall of
// `position(id, user)` per indexed chain over that chain's MNEMON market set,
// then the SDK's accrued market + position entities for the few non-zero
// hits, plus balanceOf/convertToAssets on the three vaults. Insights are a
// JOIN with the MNEMON snapshot the FE already has — nothing new upstream.
// USD figures are ESTIMATES: loan-token price = MNEMON supply_usd ÷ on-chain
// total supply (15-min snapshot), collateral via the market oracle, vault
// assets at 1 for the stables and the HYPE spot for WHYPE.

export interface MarketPosition {
  market: MarketHealthEntry;
  chainId: number;
  marketData: BlueMarketData;
  position: BluePositionData;
  loan: AssetMeta;
  collateral: AssetMeta;
  loanPriceUsd: number | null;
  supplied: bigint;
  suppliedUsd: number | null;
  debt: bigint; // accrued to the SDK's horizon
  debtUsd: number | null;
  collateralAmount: bigint;
  collateralUsd: number | null;
  ltv: number | null;
  health: number | null;
  liqPrice: number | null; // collateral price in loan units
  bookShare: number | null;
  /** Current market liquidity covers the whole supply — an exit clears today. */
  exitCovered: boolean;
  /** Best investable market on the same chain for the same loan token, and
   *  how much more it pays (fraction; ≤ 0 means this one IS the best). */
  better: { market: MarketHealthEntry; gap: number } | null;
}

export interface VaultPosition {
  name: string;
  address: Address;
  chainId: number;
  route: string;
  asset: AssetMeta;
  shares: bigint;
  assets: bigint;
  assetsUsd: number | null;
}

export interface Portfolio {
  vaults: VaultPosition[];
  markets: MarketPosition[];
  scannedChains: number[];
  /** Chains whose public RPC did not answer within the per-chain cap — their
   *  positions are simply absent this round, not zero. */
  failedChains: number[];
}

/** Per-chain wall-clock cap. Public RPCs on the big chains rate-limit hard;
 *  one slow chain must not hold the whole page. */
export const CHAIN_SCAN_TIMEOUT_MS = 25_000;

export const PORTFOLIO_VAULTS = [
  { name: "MYRMIDONS_USDT0", address: HEGEMON_V2_VAULT_ADDRESS as Address, route: "/vaults/usdt0-v2" },
  { name: "MYRMIDONS_USDC", address: USDC_V2_VAULT_ADDRESS as Address, route: "/vaults/usdc-v2" },
  { name: "MYRMIDONS_WHYPE", address: WHYPE_V2_VAULT_ADDRESS as Address, route: "/vaults/whype-v2" },
] as const;

// Read-only clients per chain, built from the same definitions the wallet
// config uses. Created lazily; a chain MNEMON indexes but the wallet config
// lacks (Arc) is skipped — no RPC to read from.
const clients = new Map<number, PublicClient>();
function clientFor(chainId: number): PublicClient | null {
  const cached = clients.get(chainId);
  if (cached) return cached;
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  // Cast: chains with custom formatters (viem's mainnet/arbitrum defs) widen
  // the client's block/tx types; every call here is generic ERC-20 / Morpho.
  const client = createPublicClient({ chain, transport: http() }) as unknown as PublicClient;
  clients.set(chainId, client);
  return client;
}

const num = (v: bigint, decimals: number) => Number(formatAmount(v, decimals, decimals));
const wad = (v: bigint | null | undefined) => (v == null || v > 10n ** 24n ? null : Number(v) / 1e18);
const STABLE = /^(USD|USDT0|USD₮0|USDC|USDE|USDG|DAI)/i;

async function scanChain(
  chainId: number,
  user: Address,
  markets: MarketHealthEntry[]
): Promise<MarketPosition[]> {
  const client = clientFor(chainId);
  const morpho = addressesRegistry[chainId as keyof typeof addressesRegistry]?.morpho as Address | undefined;
  if (!client || !morpho || markets.length === 0) return [];
  // One aggregate3 per chain: viem's default 1 KiB batch would split ~500
  // markets into ~50 RPC round-trips, which public RPCs rate-limit into
  // minutes. position() is 68 bytes of calldata and ~3k gas — a single call
  // over the whole market set is well inside every chain's block gas limit.
  const raw = await client.multicall({
    allowFailure: true,
    batchSize: 200_000,
    contracts: markets.map((m) => ({
      address: morpho,
      abi: blueAbi,
      functionName: "position" as const,
      args: [m.market_id as `0x${string}`, user],
    })),
  });
  const hits = markets.filter((_, i) => {
    const r = raw[i];
    if (r.status !== "success") return false;
    const [supplyShares, borrowShares, collateral] = r.result as unknown as [bigint, bigint, bigint];
    return supplyShares > 0n || borrowShares > 0n || collateral > 0n;
  });
  return Promise.all(
    hits.map(async (m): Promise<MarketPosition> => {
      const params = await fetchMarketParams(m.market_id as MarketId, client, { chainId });
      const market = blueMarket(client, params, chainId);
      const [marketData, position, loan, collateral] = await Promise.all([
        market.getMarketData(),
        market.getPositionData(user),
        readAssetMeta(params.loanToken, client),
        readAssetMeta(params.collateralToken, client),
      ]);
      const totalSupply = num(marketData.totalSupplyAssets, loan.decimals);
      const loanPriceUsd = m.supply_usd != null && totalSupply > 0 ? m.supply_usd / totalSupply : STABLE.test(loan.symbol) ? 1 : null;
      const usd = (v: bigint) => (loanPriceUsd != null ? num(v, loan.decimals) * loanPriceUsd : null);
      const supplied = position.supplyAssets;
      const debt = accruedDebt(position, marketData);
      const collateralValue = position.collateralValue; // loan units, or undefined without a price
      const liq = position.liquidationPrice;
      const sameLoan = markets.filter(
        (o) => o.market_id !== m.market_id && o.loan_symbol === m.loan_symbol && isInvestable(o) && o.supply_apy != null
      );
      const best = sameLoan.sort((a, b) => (b.supply_apy ?? 0) - (a.supply_apy ?? 0))[0];
      // Only a gap worth moving for (≥ 5 bps) counts as "better" — below that
      // the two markets trade places every sample.
      const better =
        best && m.supply_apy != null && (best.supply_apy ?? 0) - m.supply_apy >= 0.0005
          ? { market: best, gap: (best.supply_apy ?? 0) - m.supply_apy }
          : null;
      return {
        market: m,
        chainId,
        marketData,
        position,
        loan,
        collateral,
        loanPriceUsd,
        supplied,
        suppliedUsd: usd(supplied),
        debt,
        debtUsd: usd(debt),
        collateralAmount: position.collateral,
        collateralUsd: collateralValue != null ? usd(collateralValue) : null,
        ltv: debt > 0n ? wad(position.ltv) : null,
        health: debt > 0n ? wad(position.healthFactor) : null,
        liqPrice: liq != null && debt > 0n ? Number(liq) / 10 ** (36 + loan.decimals - collateral.decimals) : null,
        bookShare: marketData.totalSupplyAssets > 0n ? Number(supplied) / Number(marketData.totalSupplyAssets) : null,
        exitCovered: marketData.liquidity >= supplied,
        better,
      };
    })
  );
}

async function scanVaults(user: Address, hypeUsd: number | null): Promise<VaultPosition[]> {
  const client = clientFor(HEGEMON_V2_VAULT_CHAIN_ID);
  if (!client) return [];
  const shares = await client.multicall({
    allowFailure: false,
    contracts: PORTFOLIO_VAULTS.map((v) => ({ address: v.address, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [user] })),
  });
  const held = PORTFOLIO_VAULTS.map((v, i) => ({ ...v, shares: shares[i] as bigint })).filter((v) => v.shares > 0n);
  return Promise.all(
    held.map(async (v) => {
      const [assets, assetAddress] = await Promise.all([
        client.readContract({ address: v.address, abi: ERC4626_ABI, functionName: "convertToAssets", args: [v.shares] }) as Promise<bigint>,
        client.readContract({ address: v.address, abi: ERC4626_ABI, functionName: "asset" }) as Promise<Address>,
      ]);
      const asset = await readAssetMeta(assetAddress, client);
      const price = STABLE.test(asset.symbol) ? 1 : /HYPE/i.test(asset.symbol) ? hypeUsd : null;
      return {
        name: v.name,
        address: v.address,
        chainId: HEGEMON_V2_VAULT_CHAIN_ID,
        route: v.route,
        asset,
        shares: v.shares,
        assets,
        assetsUsd: price != null ? num(assets, asset.decimals) * price : null,
      };
    })
  );
}

/** Chains the portfolio can read: indexed by MNEMON AND present in the wallet config. */
export const PORTFOLIO_CHAINS = MNEMON_CHAINS.filter((c) => CHAINS.some((w) => w.id === c.id)).map((c) => c.id);

/** The whole scan, framework-free (the hook, the terminal and the probe script share it). */
export async function scanPortfolio(user: Address, markets: MarketHealthEntry[], hypeUsd: number | null): Promise<Portfolio> {
  const real = markets.filter(isRealMarket);
  const failedChains: number[] = [];
  const capped = (chainId: number) =>
    Promise.race([
      scanChain(chainId, user, real.filter((m) => chainOf(m) === chainId)),
      new Promise<MarketPosition[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHAIN_SCAN_TIMEOUT_MS)),
    ]).catch(() => {
      failedChains.push(chainId);
      return [] as MarketPosition[];
    });
  const [vaults, perChain] = await Promise.all([
    scanVaults(user, hypeUsd).catch(() => [] as VaultPosition[]),
    Promise.all(PORTFOLIO_CHAINS.map(capped)),
  ]);
  return { vaults, markets: perChain.flat(), scannedChains: PORTFOLIO_CHAINS, failedChains };
}

export function usePortfolio(
  account: Address | undefined,
  markets: MarketHealthEntry[] | undefined,
  hypeUsd: number | null
) {
  const real = (markets ?? []).filter(isRealMarket);
  // Re-scan when the snapshot changes (same markets, fresh stats) — keyed on
  // a cheap fingerprint instead of the whole array.
  const snapshotKey = real.length ? `${real.length}:${real[0]?.ts ?? ""}` : "";
  return useQuery({
    queryKey: ["portfolio", account ?? null, snapshotKey, hypeUsd ?? null],
    enabled: Boolean(account && real.length),
    queryFn: () => scanPortfolio(account as Address, real, hypeUsd),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
