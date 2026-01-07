"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base } from "viem/chains";
import { useEffect, useState } from "react";

// Supported chains: Base and HyperEVM
const SUPPORTED_CHAINS = [base.id, 999];

function WalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && !SUPPORTED_CHAINS.includes(chainId);

  if (!isConnected || !address) return null;

  return (
    <>
      {isWrongNetwork ? (
        <Badge variant="danger" className="text-xs">
          WRONG NETWORK
        </Badge>
      ) : (
        <Badge variant="success" className="text-xs">
          CONNECTED
        </Badge>
      )}
    </>
  );
}

export function Header() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-panel border-b border-border">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-border rounded flex items-center justify-center text-xs font-mono">
              M
            </div>
            <Link
              href="/"
              className="text-lg font-semibold hover:text-text/80 transition-colors"
            >
              MYRMIDONS
            </Link>
          </div>

          {/* Middle: Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/modules/arbitrage"
              className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide"
            >
              Modules
            </Link>
            <Link
              href="/vaults"
              className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide"
            >
              Vaults
            </Link>
            <Link
              href="/portfolio"
              className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide"
            >
              Portfolio
            </Link>
          </nav>

          {/* Right: Connect Button / Wallet State */}
          <div className="flex items-center gap-3">
            {mounted && <WalletStatus />}
            {mounted && (
              <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== "loading";
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus ||
                    authenticationStatus === "authenticated");

                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openConnectModal}
                          >
                            Connect
                          </Button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={openChainModal}
                          >
                            Wrong network
                          </Button>
                        );
                      }

                      return (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={openAccountModal}
                          className="text-xs font-mono"
                        >
                          {account.displayName}
                          {account.displayBalance
                            ? ` (${account.displayBalance})`
                            : ""}
                        </Button>
                      );
                    })()}
                  </div>
                );
              }}
              </ConnectButton.Custom>
            )}
            {!mounted && (
              <Button variant="outline" size="sm" disabled>
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

