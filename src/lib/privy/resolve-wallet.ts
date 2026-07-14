import { getPrivyServerClient, serverSigningEnabled } from "@/lib/privy/server";

/** Resolve the Privy server wallet id for an embedded wallet address. */
export async function resolvePrivyWalletId(
  address: string,
  storedId?: string,
): Promise<string | undefined> {
  if (!serverSigningEnabled()) return storedId;

  const normalized = address.toLowerCase();

  try {
    const privy = getPrivyServerClient();
    const wallet = await privy.wallets().getWalletByAddress({ address: normalized });
    if (wallet.id) return wallet.id;
  } catch {
    /* fall back to stored session id */
  }

  return storedId?.trim() || undefined;
}
