import type { WalletClient } from "viem";
import type { Address } from "viem";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";
import { submitDepositWalletApprovals } from "@/lib/polymarket/deposit-approvals-core";

/** Server-side deposit wallet approvals (ECS builder keys + Privy session signer). */
export async function ensureDepositWalletApprovalsServer(
  walletClient: WalletClient,
  depositAddress: Address,
  onStatus?: (message: string) => void,
): Promise<void> {
  const builderConfig = getRelayBuilderConfig();
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
