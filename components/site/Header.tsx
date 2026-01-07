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
    <header className="h-14 border-b border-border bg-bg-base flex items-center justify-between px-4 shrink-0 z-20 relative shadow-crt">
      <div className="flex items-center gap-6">
          {/* Left: Logo + Brand */}
          <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-border flex items-center justify-center text-xs font-mono">
              M
            </div>
            <Link
              href="/"
            className="text-lg font-bold tracking-wider uppercase hover:text-text/80 transition-colors"
            >
              MYRMIDONS
            </Link>
          </div>

          {/* Middle: Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/modules/arbitrage"
            className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide font-mono"
            >
              Modules
            </Link>
            <Link
              href="/vaults"
            className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide font-mono"
            >
              Vaults
            </Link>
            <Link
              href="/portfolio"
            className="text-sm text-text/70 hover:text-text transition-colors uppercase tracking-wide font-mono"
            >
              Portfolio
            </Link>
          </nav>
      </div>

          {/* Right: Connect Button / Wallet State */}
      <div className="flex items-center gap-4">
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
                      <button
                            onClick={openConnectModal}
                        className="flex items-center gap-2 border border-border hover:bg-border/10 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                          >
                            Connect
                      </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                      <button
                            onClick={openChainModal}
                        className="flex items-center gap-2 border border-border hover:bg-border/10 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                          >
                            Wrong network
                      </button>
                        );
                      }

                  const addressDisplay = account.address 
                    ? `[ ${account.address.slice(0, 4)}...${account.address.slice(-4)} ]` 
                    : account.displayName || "[ NOT CONNECTED ]";

                      return (
                    <button
                          onClick={openAccountModal}
                      className="flex items-center gap-2 border border-border hover:bg-border/10 text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                        >
                      <span className="w-2 h-2 bg-success rounded-full animate-pulse-slow" />
                      {addressDisplay}
                    </button>
                      );
                    })()}
                  </div>
                );
              }}
              </ConnectButton.Custom>
            )}
            {!mounted && (
          <button
            disabled
            className="flex items-center gap-2 border border-border text-text-dim px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors opacity-50"
          >
                Connect
          </button>
            )}
      </div>
    </header>
  );
}

