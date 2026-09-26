/**
 * The three MYRMIDONS vaults as the terminal addresses them: `vault stats usdc`,
 * `deposit 100 whype`, `alloc usdt0`. A command with no vault given acts on the
 * slotted shard (the STRATEGIES tile that is open), and on USDT0 when none is.
 */
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
  WHYPE_V2_VAULT_ADDRESS,
  WHYPE_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

export interface VaultDef {
  key: "usdt0" | "usdc" | "whype";
  name: string;            // the tile / prompt name
  fsId: string;            // filesystem tile id (the #file= hash)
  address: `0x${string}`;
  chainId: number;
  asset: string;
  aliases: string[];
}

export const VAULTS: VaultDef[] = [
  { key: "usdt0", name: "MYRMIDONS_USDT0", fsId: "strategy-usdt0-v2", address: HEGEMON_V2_VAULT_ADDRESS as `0x${string}`, chainId: HEGEMON_V2_VAULT_CHAIN_ID, asset: "USDT0", aliases: ["usdt0", "usdt", "hegemon", "hegemon-v2", "v2"] },
  { key: "usdc", name: "MYRMIDONS_USDC", fsId: "strategy-usdc-v2", address: USDC_V2_VAULT_ADDRESS as `0x${string}`, chainId: USDC_V2_VAULT_CHAIN_ID, asset: "USDC", aliases: ["usdc"] },
  { key: "whype", name: "MYRMIDONS_WHYPE", fsId: "strategy-whype-v2", address: WHYPE_V2_VAULT_ADDRESS as `0x${string}`, chainId: WHYPE_V2_VAULT_CHAIN_ID, asset: "WHYPE", aliases: ["whype", "hype"] },
];

/** A vault by key, alias, tile name or address; null when `ref` names nothing. */
export function findVault(ref: string): VaultDef | null {
  const q = ref.trim().toLowerCase();
  return VAULTS.find((v) => v.key === q || v.aliases.includes(q) || v.name.toLowerCase() === q || v.address.toLowerCase() === q) ?? null;
}

/** The vault a command means: the one named, else the slotted shard's, else USDT0. */
export function resolveVaultRef(ref: string | undefined, slottedFsId: string | null | undefined): { vault: VaultDef; from: "arg" | "shard" | "default" } | { error: string } {
  if (ref) {
    const v = findVault(ref);
    return v ? { vault: v, from: "arg" } : { error: `UNKNOWN_VAULT  ${ref} — usdt0, usdc or whype` };
  }
  const slotted = slottedFsId ? VAULTS.find((v) => v.fsId === slottedFsId) : null;
  return slotted ? { vault: slotted, from: "shard" } : { vault: VAULTS[0], from: "default" };
}
