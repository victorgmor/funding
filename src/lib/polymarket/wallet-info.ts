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
  lockedUsdc: number;
  withdrawableUsdc: number;
};

export async function fetchPolymarketWalletInfo(
  owner: Address,
): Promise<PolymarketWalletInfo> {
  const depositAddress = await deriveDepositWalletAddress(owner);
  const [
    depositDeployed,
    ownerPusd,
    ownerCollateral,
    depositCollateral,
    depositRes,
  ] = await Promise.all([
    isDepositWalletDeployed(depositAddress),
    readPusdBalanceUsdc(owner),
    readOwnerCollateralBalanceUsdc(owner),
    readDepositWalletBalanceUsdc(owner),
    fetch(`/api/investor/deposit?address=${encodeURIComponent(owner)}`),
  ]);

  let lockedUsdc = 0;
  let withdrawableUsdc = depositCollateral;
  if (depositRes.ok) {
    const data = (await depositRes.json()) as {
      lockedUsdc: number;
      withdrawableUsdc: number;
    };
    lockedUsdc = data.lockedUsdc;
    withdrawableUsdc = data.withdrawableUsdc;
  }

  return {
    owner,
    depositAddress,
    depositDeployed,
    ownerPusd,
    ownerCollateral,
    depositCollateral,
    lockedUsdc,
    withdrawableUsdc,
  };
}
