import { Panel } from "@/components/ui/panel";
import { AsciiCard } from "@/components/ui/ascii-card";

export default function VaultsPage() {
  return (
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 uppercase tracking-wide">
          Vaults
        </h1>
        <Panel title="AVAILABLE VAULTS">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AsciiCard
              title="Morpho Reallocator"
              subtitle="USDT0"
              status="ACTIVE"
              href="/vaults/usdt0"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

