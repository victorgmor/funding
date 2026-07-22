import type { Address } from "viem";
import {
  readDepositWalletBalanceUsdc,
  readInvestorCollateralUsdc,
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
  /** Total pUSD/USDC across EOA + deposit + Safe — what Account should show. */
  totalCollateral: number;
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
    totalCollateral,
    depositRes,
  ] = await Promise.all([
    isDepositWalletDeployed(depositAddress),
    readPusdBalanceUsdc(owner),
    readOwnerCollateralBalanceUsdc(owner),
    readDepositWalletBalanceUsdc(owner),
    readInvestorCollateralUsdc(owner),
    fetch(`/api/investor/deposit?address=${encodeURIComponent(owner)}`),
  ]);

  let lockedUsdc = 0;
  let withdrawableUsdc = totalCollateral;
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
    totalCollateral,
    lockedUsdc,
    withdrawableUsdc,
  };
}
