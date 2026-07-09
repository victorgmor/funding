import { getSecret } from "astro:env/server";
import { isValidFeeWallet } from "@/lib/funds/commission";

export function getPlatformFeeWallet(): `0x${string}` | null {
  const raw =
    getSecret("PLATFORM_FEE_WALLET")?.trim() ||
    process.env.PLATFORM_FEE_WALLET?.trim();
  return isValidFeeWallet(raw) ? raw : null;
}
