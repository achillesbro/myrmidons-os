import { VaultV2Page } from "@/components/vault/VaultV2Page";
import { WHYPE_V2_VAULT_ADDRESS, WHYPE_V2_VAULT_CHAIN_ID } from "@/lib/constants/vaults";

export default function WhypeV2VaultPage() {
  return (
    <VaultV2Page
      vaultAddress={WHYPE_V2_VAULT_ADDRESS}
      vaultChainId={WHYPE_V2_VAULT_CHAIN_ID}
      assetSymbol="WHYPE"
      assetLogoSrc="/WHYPE-TokenIcon.svg"
    />
  );
}
