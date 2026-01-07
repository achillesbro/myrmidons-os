import { Panel } from "@/components/ui/panel";
import { KpiCard } from "@/components/ui/kpi-card";
import { AsciiCard } from "@/components/ui/ascii-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function UIShowcasePage() {
  return (
    <div className="min-h-screen bg-bg-base p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 uppercase tracking-wide">
          UI Components Showcase
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Panel with title and rightSlot */}
            <Panel
              title="System Status"
              rightSlot={<Badge variant="success">ONLINE</Badge>}
            >
              <p className="text-sm text-text/70">
                All systems operational. Monitoring active algorithms.
              </p>
            </Panel>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                label="Total TVL"
                value="$1.2M"
                subValue="+5.2% 24h"
                accent="gold"
              />
              <KpiCard
                label="Net APY"
                value="12.4%"
                subValue="+0.8% 24h"
                accent="success"
              />
              <KpiCard
                label="24h Yield"
                value="$1,240"
                subValue="+2.1%"
                accent="default"
              />
              <KpiCard
                label="Risk Score"
                value="LOW"
                subValue="Stable"
                accent="success"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Algorithm Cards */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-text/70 mb-2">
                Algorithm Cards
              </h2>
              <AsciiCard
                title="Morpho Reallocator"
                subtitle="USDT0"
                status="ACTIVE"
                href="/vaults/usdt0"
              />
              <AsciiCard
                title="Arbitrage Bot"
                subtitle="Cross-chain"
                status="SOON"
              />
              <AsciiCard
                title="Liquidation Protection"
                subtitle="Multi-vault"
                status="SOON"
              />
            </div>

            {/* Buttons Row */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-text/70 mb-2">
                Buttons
              </h2>
              <div className="flex flex-wrap gap-3">
                <Button variant="default" size="md">
                  Default
                </Button>
                <Button variant="gold" size="md">
                  Gold
                </Button>
                <Button variant="outline" size="md">
                  Outline
                </Button>
                <Button variant="ghost" size="md">
                  Ghost
                </Button>
                <Button variant="default" size="sm">
                  Small
                </Button>
              </div>
            </div>

            {/* Badges Row */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-text/70 mb-2">
                Badges
              </h2>
              <div className="flex flex-wrap gap-3">
                <Badge variant="default">Default</Badge>
                <Badge variant="gold">Gold</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>

            {/* Tabs Demo */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase tracking-wide text-text/70 mb-2">
                Tabs
              </h2>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="strategy">Strategy</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4">
                  <Panel>
                    <p className="text-sm text-text/70">
                      Overview content placeholder. This would show vault metrics
                      and general information.
                    </p>
                  </Panel>
                </TabsContent>
                <TabsContent value="strategy" className="mt-4">
                  <Panel>
                    <p className="text-sm text-text/70">
                      Strategy content placeholder. This would show algorithm
                      parameters, execution history, and detailed breakdowns.
                    </p>
                  </Panel>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

