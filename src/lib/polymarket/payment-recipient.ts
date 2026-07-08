import { fetchPolymarketProfile } from "@/lib/polymarket/profile";

export async function resolvePaymentRecipient(
  creatorAddress: string,
): Promise<`0x${string}` | null> {
  if (!/^0x[a-fA-F0-9]{40}$/i.test(creatorAddress)) return null;

  const profile = await fetchPolymarketProfile(creatorAddress);
  const proxy = profile?.proxyWallet?.trim();
  if (proxy && /^0x[a-fA-F0-9]{40}$/i.test(proxy)) {
    return proxy as `0x${string}`;
  }

  return creatorAddress.toLowerCase() as `0x${string}`;
}
