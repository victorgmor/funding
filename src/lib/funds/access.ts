import { isCreatorWallet } from "@/lib/funds/creator";
import type { Fund } from "@/lib/funds/types";

export function isFundOwnerWallet(fund: Fund, wallet?: string): boolean {
  if (!wallet || !isCreatorWallet(fund.manager.id)) return false;
  return wallet.toLowerCase() === fund.manager.id.toLowerCase();
}
