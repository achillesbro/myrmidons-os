"use client";

import Link from "next/link";
import Image from "next/image";
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
            <Link
              href="/"
            className="flex items-center gap-3 h-10 hover:opacity-80 transition-opacity"
          >
            {/* Header text - cropped to center */}
            <div className="relative h-full overflow-hidden" style={{ width: '250px' }}>
              <Image
                src="/myrmidons-header.png"
                alt="MYRMIDONS"
                fill
                className="object-cover"
                style={{ objectPosition: 'center 49%' }}
                priority
                sizes="250px"
              />
            </div>
            {/* Logo with glow effect */}
            <div className="relative h-full w-auto">
              <Image
                src="/myrmidons-logo.png"
                alt="MYRMIDONS Logo"
                width={200}
                height={40}
                className="h-full w-auto object-contain"
                priority
                style={{
                  filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))"
                }}
              />
            </div>
            </Link>

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

