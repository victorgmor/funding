import type { Address } from "viem";
import {
  readDepositWalletBalanceUsdc,
  readOwnerCollateralBalanceUsdc,
  readPusdBalanceUsdc,
} from "@/lib/polymarket/deposit-balance";
import { isDepositWalletDeployed } from "@/lib/polymarket/depositWallet";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";

export type PolymarketWalletInfo = {
  owner: Address;
  depositAddress: Address;
  depositDeployed: boolean;
  ownerPusd: number;
  ownerCollateral: number;
  depositCollateral: number;
};

export async function fetchPolymarketWalletInfo(
  owner: Address,
): Promise<PolymarketWalletInfo> {
  const depositAddress = await deriveDepositWalletAddress(owner);
  const [depositDeployed, ownerPusd, ownerCollateral, depositCollateral] =
    await Promise.all([
      isDepositWalletDeployed(depositAddress),
      readPusdBalanceUsdc(owner),
      readOwnerCollateralBalanceUsdc(owner),
      readDepositWalletBalanceUsdc(owner),
    ]);

  return {
    owner,
    depositAddress,
    depositDeployed,
    ownerPusd,
    ownerCollateral,
    depositCollateral,
  };
}
