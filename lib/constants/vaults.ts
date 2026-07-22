/**
 * Vault addresses and chain configurations
 */

// USDT0 Morpho Vault on HyperEVM
export const USDT0_VAULT_ADDRESS = "0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42";
export const USDT0_VAULT_CHAIN_ID = 999; // HyperEVM

// HEGEMON_V2 — Morpho Vault V2 (USDT0) on HyperEVM ("Test MYRMIDONS V2", in dev).
// V2 vaults are served by the vaultV2ByAddress API entity; pass v2=true to the
// /api/morpho/vault/* routes (the useVault* hooks take a v2 flag).
export const HEGEMON_V2_VAULT_ADDRESS = "0xB851D568d123077E787860a34da286255249d983";
export const HEGEMON_V2_VAULT_CHAIN_ID = 999; // HyperEVM

// MYRMIDONS USDC — second Morpho Vault V2 on HyperEVM, run by the same
// HEGEMON_V2 bot process (one container, both vaults on its whitelist).
export const USDC_V2_VAULT_ADDRESS = "0x7EE335d7Bd6355C5fa651776B0EBdB726f929766";
export const USDC_V2_VAULT_CHAIN_ID = 999; // HyperEVM

