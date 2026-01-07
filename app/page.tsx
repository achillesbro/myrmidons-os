import { Panel } from "@/components/ui/panel";
import { AsciiCard } from "@/components/ui/ascii-card";

export default function Home() {
  const logLines = [
    "[2024-01-15 10:23:45] INFO: System initialized",
    "[2024-01-15 10:23:46] INFO: Monitoring vault: USDT0",
    "[2024-01-15 10:23:47] INFO: Reallocation check scheduled",
    "[2024-01-15 10:23:48] WARN: Low liquidity detected on pool #3",
    "[2024-01-15 10:23:49] INFO: Reallocation executed: +2.1% APY",
    "[2024-01-15 10:23:50] INFO: Health check passed",
    "[2024-01-15 10:23:51] INFO: Next check in 300s",
    "[2024-01-15 10:23:52] INFO: Pool #1 utilization: 78%",
    "[2024-01-15 10:23:53] INFO: Pool #2 utilization: 65%",
    "[2024-01-15 10:23:54] INFO: APY optimization: +0.8%",
    "[2024-01-15 10:23:55] INFO: Gas estimate: 145,000",
    "[2024-01-15 10:23:56] WARN: Slippage threshold: 0.5%",
    "[2024-01-15 10:23:57] INFO: Transaction queued",
    "[2024-01-15 10:23:58] INFO: Execution confirmed",
  ];

  return (
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          {/* Left: Terminal Panel (35-40% width) */}
          <div className="lg:col-span-5">
            <Panel title="TERMINAL">
              <div className="border border-border/50 rounded-md p-3 bg-bg-base/50">
                <div className="font-mono text-xs space-y-1 h-[400px] overflow-y-auto">
                  {logLines.map((line, idx) => {
                    const isWarn = line.includes("WARN");
                    const isErr = line.includes("ERR");
                    const isInfo = line.includes("INFO");
                    
                    return (
                      <div
                        key={idx}
                        className={`${
                          isWarn
                            ? "text-gold"
                            : isErr
                            ? "text-danger"
                            : isInfo
                            ? "text-text/70"
                            : "text-text/60"
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>
          </div>

          {/* Right: Algorithms Panel (60-65% width) */}
          <div className="lg:col-span-7">
            <Panel title="ALGORITHMS">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AsciiCard
                  title="Morpho Reallocator"
                  subtitle="USDT0 Vault"
                  status="ACTIVE"
                  href="/vaults/usdt0"
                  className="border-gold/50 hover:border-gold hover:shadow-sm"
                />
                <AsciiCard
                  title="DEX Arbitrage"
                  subtitle="Cross-pool / atomic"
                  status="SOON"
                  href="/modules/arbitrage"
                  className="opacity-75"
                />
                <AsciiCard
                  title="Liquidation Protection"
                  subtitle="Margin-aware engine"
                  status="SOON"
                  href="/modules/liquidation"
                  className="opacity-75"
                />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
