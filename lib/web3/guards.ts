import { type Address } from "viem";

export class Web3GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Web3GuardError";
  }
}

/**
 * Assert that a wallet is connected
 * @throws Web3GuardError if not connected
 */
export function assertConnected(account: Address | undefined): asserts account is Address {
  if (!account) {
    throw new Web3GuardError("Please connect your wallet");
  }
}

/**
 * Assert that the current chain matches the expected chain
 * @throws Web3GuardError if chain doesn't match
 */
export function assertChain(chainId: number, expected: number = 999): void {
  if (chainId !== expected) {
    throw new Web3GuardError(
      `Please switch to the correct network (expected chain ID: ${expected})`
    );
  }
}

