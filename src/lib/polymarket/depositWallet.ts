import { RelayClient } from "@polymarket/builder-relayer-client";
import type { Address, WalletClient } from "viem";
import { polygon } from "wagmi/chains";
import { getClientRelayBuilderConfig } from "@/lib/polymarket/builder";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

export async function ensureDepositWallet(
  walletClient: WalletClient,
  onStatus?: (message: string) => void,
): Promise<Address> {
  const builderConfig = getClientRelayBuilderConfig();
  const relayer = new RelayClient(
    RELAYER_URL,
    polygon.id,
    walletClient,
    builderConfig,
  );
  const address = (await relayer.deriveDepositWalletAddress()) as Address;

  const deployed = await relayer.getDeployed(address, "WALLET");
  if (!deployed) {
    onStatus?.("Creating your Polymarket deposit wallet…");
    const response = await relayer.deployDepositWallet();
    const confirmed = await response.wait();
    if (!confirmed) {
      throw new Error(
        "Deposit wallet setup failed — try again in a minute or log in at polymarket.com first",
      );
    }
  }

  return address;
}
