import { seedFunds } from "@/data/funds";
import { isCreatorWallet } from "@/lib/funds/creator";
import type { Fund } from "@/lib/funds/types";

export function isUserFund(fund: Fund): boolean {
  return (
    isCreatorWallet(fund.manager.id) &&
    !seedFunds.some((row) => row.id === fund.id)
  );
}

export function isFundOwner(fund: Fund, wallet?: string): boolean {
  if (!wallet || !isCreatorWallet(fund.manager.id)) return false;
  return wallet.toLowerCase() === fund.manager.id.toLowerCase();
}
