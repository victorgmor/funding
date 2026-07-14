import type { Address, WalletClient } from "viem";
import { getClientRelayBuilderConfig } from "@/lib/polymarket/builder";
import { submitDepositWalletApprovals } from "@/lib/polymarket/deposit-approvals-core";

/** Browser-side deposit wallet approvals (Privy wallet + remote builder sign). */
export async function ensureDepositWalletApprovals(
  walletClient: WalletClient,
  depositAddress: Address,
  onStatus?: (message: string) => void,
): Promise<void> {
  const builderConfig = getClientRelayBuilderConfig();
  if (!builderConfig) {
    throw new Error(
      "Polymarket builder keys not configured — approvals cannot be submitted",
    );
  }

  await submitDepositWalletApprovals(
    walletClient,
    depositAddress,
    builderConfig,
    onStatus,
  );
}
