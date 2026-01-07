import { Panel } from "@/components/ui/panel";
import { AsciiCard } from "@/components/ui/ascii-card";

export default function LiquidationModulePage() {
  return (
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 uppercase tracking-wide">
          Liquidation Protection Module
        </h1>
        <Panel title="COMING SOON">
          <p className="text-sm text-text/70 mb-6">
            Multi-vault liquidation protection will be available here.
          </p>
          <AsciiCard
            title="Back to Home"
            subtitle="Return to dashboard"
            href="/"
          />
        </Panel>
      </div>
    </div>
  );
}

