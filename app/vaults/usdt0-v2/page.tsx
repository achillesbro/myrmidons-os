import { VaultV2Page } from "@/components/vault/VaultV2Page";
import { HEGEMON_V2_VAULT_ADDRESS, HEGEMON_V2_VAULT_CHAIN_ID } from "@/lib/constants/vaults";

export default function Usdt0V2VaultPage() {
  return (
    <VaultV2Page
      vaultAddress={HEGEMON_V2_VAULT_ADDRESS}
      vaultChainId={HEGEMON_V2_VAULT_CHAIN_ID}
      assetSymbol="USD₮0"
    />
  );
}
