import { isCreatorWallet } from "@/lib/funds/creator";
import { hasEntitlement } from "@/lib/funds/entitlements";
import type { Fund } from "@/lib/funds/types";

export function fundUnlockPrice(fund: Fund): number | null {
  const price = fund.unlockPriceUsdc;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price;
}

export function isPaidFund(fund: Fund): boolean {
  return fundUnlockPrice(fund) != null;
}

export function isFundOwnerWallet(fund: Fund, wallet?: string): boolean {
  if (!wallet || !isCreatorWallet(fund.manager.id)) return false;
  return wallet.toLowerCase() === fund.manager.id.toLowerCase();
}

export async function canAccessFund(
  fund: Fund,
  wallet?: string,
): Promise<boolean> {
  if (!isPaidFund(fund)) return true;
  if (isFundOwnerWallet(fund, wallet)) return true;
  if (!wallet) return false;
  return hasEntitlement(wallet, fund.slug);
}

export function redactFund(fund: Fund): Fund {
  return {
    ...fund,
    thesis: "",
    description: fund.description ? "Paid bundle — unlock to view." : "",
    markets: [],
  };
}
