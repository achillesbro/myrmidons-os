/**
 * View model helpers for safe data access and formatting
 */

export function safeNumber(
  value: string | number | undefined | null,
  fallback?: number
): number | undefined {
  if (value === undefined || value === null) return fallback;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? fallback : num;
}

export function formatUsd(value: string | number | undefined | null): string {
  const num = safeNumber(value);
  if (num === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    notation: num >= 1_000_000 ? "compact" : "standard",
  }).format(num);
}

export function formatPct(
  value: string | number | undefined | null,
  decimals: number = 2,
  isDecimal: boolean = false
): string {
  const num = safeNumber(value);
  if (num === undefined) return "—";
  // If isDecimal is true, multiply by 100 (e.g., 0.12 -> 12%)
  const percentage = isDecimal ? num * 100 : num;
  return `${percentage.toFixed(decimals)}%`;
}

export function formatApy(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  // APY is already a percentage (0.12 = 12%), multiply by 100
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDateShort(unixMs: number): string {
  const date = new Date(unixMs);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  return `${month} ${day.toString().padStart(2, "0")}`;
}

export interface KpiData {
  tvlUsd?: string;
  netApyPct?: string;
  utilizationPct?: string;
  riskScore?: string;
}

export function pickKpis(
  metadata: { vaultByAddress?: { state?: { totalAssetsUsd?: string | number; apy?: string | number; netApy?: string | number } } | null } | null,
  apy: { vaultByAddress?: { state?: { netApy?: string | number; apy?: string | number } } | null } | null,
  allocations?: { vaultByAddress?: { state?: { allocation?: Array<{ market?: { state?: { utilization?: string | number } } }> } } | null } | null
): KpiData {
  const tvlUsd = metadata?.vaultByAddress?.state?.totalAssetsUsd;
  // Try netApy from either metadata or apy query, fallback to apy
  const netApy = 
    apy?.vaultByAddress?.state?.netApy || 
    metadata?.vaultByAddress?.state?.netApy ||
    apy?.vaultByAddress?.state?.apy ||
    metadata?.vaultByAddress?.state?.apy;

  // Calculate average utilization from allocations if available
  let utilizationPct: string | undefined = undefined;
  const allocationArray = allocations?.vaultByAddress?.state?.allocation;
  if (allocationArray && allocationArray.length > 0) {
    const utilizations = allocationArray
      .map(alloc => safeNumber(alloc.market?.state?.utilization))
      .filter((u): u is number => u !== undefined);
    
    if (utilizations.length > 0) {
      const avgUtilization = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
      // Utilization is typically a decimal (0.75 = 75%), convert to percentage
      const avgUtilizationPct = avgUtilization < 1 ? avgUtilization * 100 : avgUtilization;
      utilizationPct = formatPct(avgUtilizationPct);
    }
  }

  // APY from Morpho API is always a decimal (0.12 = 12%, 0.005 = 0.5%)
  // Always multiply by 100 to convert to percentage
  let netApyFormatted: string | undefined = undefined;
  if (netApy !== undefined) {
    const num = safeNumber(netApy);
    if (num !== undefined) {
      netApyFormatted = formatPct(num * 100, 2);
    }
  }

  return {
    tvlUsd: tvlUsd !== undefined ? formatUsd(tvlUsd) : undefined,
    netApyPct: netApyFormatted,
    utilizationPct,
    riskScore: undefined, // Not available in current API response
  };
}

export interface AllocationRow {
  market: string;
  allocationPct?: number;
  apyPct?: number;
}

export function pickAllocations(
  allocations: {
    vaultByAddress?: {
      state?: {
        totalAssetsUsd?: string | number;
        allocation?: Array<{
          market?: {
            uniqueKey?: string;
            loanAsset?: { symbol?: string };
            collateralAsset?: { symbol?: string };
            state?: {
              supplyApy?: string | number;
              utilization?: string | number;
            };
          };
          supplyAssets?: string | number;
          supplyAssetsUsd?: string | number;
        }>;
      };
    } | null;
  } | null
): AllocationRow[] {
  const allocationArray = allocations?.vaultByAddress?.state?.allocation;

  if (!allocationArray || allocationArray.length === 0) {
    return [];
  }

  const totalUsd = safeNumber(allocations?.vaultByAddress?.state?.totalAssetsUsd);
  
  const processed = allocationArray
    .filter((alloc) => {
      // Filter out allocations with no market info
      return alloc.market && (alloc.market.uniqueKey || alloc.market.loanAsset);
    })
    .map((alloc) => {
      const supplyUsd = safeNumber(alloc.supplyAssetsUsd);
      const allocationPct =
        supplyUsd !== undefined && totalUsd !== undefined && totalUsd > 0
          ? (supplyUsd / totalUsd) * 100
          : undefined;

      // Extract APY from market.state.supplyApy
      // API always returns as decimal (0.12 = 12%, 0.005 = 0.5%), always multiply by 100
      const marketApy = safeNumber(alloc.market?.state?.supplyApy);
      const apyPct = marketApy !== undefined ? marketApy * 100 : undefined;

      // Build market name: "LoanAsset / CollateralAsset" format
      // e.g., "USDT0 / WETH" or "USDT0 / USDC"
      const loanAsset = alloc.market?.loanAsset?.symbol;
      const collateralAsset = alloc.market?.collateralAsset?.symbol;
      
      let marketName: string;
      if (loanAsset && collateralAsset) {
        marketName = `${loanAsset} / ${collateralAsset}`;
      } else if (loanAsset) {
        marketName = loanAsset;
      } else if (alloc.market?.uniqueKey) {
        // Fallback: use first 20 chars of uniqueKey
        marketName = alloc.market.uniqueKey.slice(0, 20);
      } else {
        marketName = "Unknown";
      }


      return {
        market: marketName,
        allocationPct,
        apyPct,
      };
    })
    .filter((row) => {
      // Filter out markets with 0% allocation or undefined allocation
      return row.allocationPct !== undefined && row.allocationPct > 0;
    });

  // Sort by allocation percentage in descending order (highest first)
  return processed.sort((a, b) => {
    const aPct = a.allocationPct ?? 0;
    const bPct = b.allocationPct ?? 0;
    return bPct - aPct; // Descending order
  });
}

