import type { WalletClient } from "viem";
import { sendGiftFromPolymarketBalance } from "@/lib/polymarket/relay-gift";

export async function sendGift(
  walletClient: WalletClient,
  recipient: `0x${string}`,
  amountUsdc: number,
  onStatus?: (message: string) => void,
): Promise<string> {
  return sendGiftFromPolymarketBalance(
    walletClient,
    recipient,
    amountUsdc,
    onStatus,
  );
}

export function formatGiftError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Gift failed";
  const lower = raw.toLowerCase();

  if (lower.includes("reject") || lower.includes("denied")) {
    return "Signature rejected — approve the request in your wallet";
  }
  if (lower.includes("no polymarket cash found")) {
    return raw;
  }
  if (lower.includes("builder")) {
    return "Gift service unavailable — builder credentials not configured";
  }

  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}
