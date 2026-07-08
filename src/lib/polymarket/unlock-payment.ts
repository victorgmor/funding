import type { WalletClient } from "viem";
import { sendUsdcFromPolymarketBalance } from "@/lib/polymarket/relay-gift";

export async function payBundleUnlock(
  walletClient: WalletClient,
  recipient: `0x${string}`,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  return sendUsdcFromPolymarketBalance(
    walletClient,
    recipient,
    amountUsdc,
    onStatus,
  );
}

export function formatUnlockPaymentError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Payment failed";
  const lower = raw.toLowerCase();

  if (lower.includes("reject") || lower.includes("denied")) {
    return "Signature rejected — approve the request in your wallet";
  }
  if (lower.includes("no polymarket cash found")) {
    return raw;
  }
  if (lower.includes("builder")) {
    return "Payment service unavailable — builder credentials not configured";
  }
  if (lower.includes("networkerror") || lower.includes("failed to fetch")) {
    return "Could not reach payment service — check connection and try again";
  }

  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}
