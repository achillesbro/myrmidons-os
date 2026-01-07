import { Panel } from "@/components/ui/panel";

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 uppercase tracking-wide">
          Portfolio
        </h1>
        <Panel title="COMING SOON">
          <p className="text-sm text-text/70">
            Portfolio overview and analytics will be available here.
          </p>
        </Panel>
      </div>
    </div>
  );
}

