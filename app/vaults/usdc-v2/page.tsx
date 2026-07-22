import { VaultV2Page } from "@/components/vault/VaultV2Page";
import { USDC_V2_VAULT_ADDRESS, USDC_V2_VAULT_CHAIN_ID } from "@/lib/constants/vaults";

export default function UsdcV2VaultPage() {
  return (
    <VaultV2Page
      vaultAddress={USDC_V2_VAULT_ADDRESS}
      vaultChainId={USDC_V2_VAULT_CHAIN_ID}
      assetSymbol="USDC"
      assetLogoSrc={null}
    />
  );
}
