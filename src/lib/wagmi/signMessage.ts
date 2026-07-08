import { getWalletClient } from "@wagmi/core";
import { wagmiConfig } from "@/lib/wagmi/config";

export async function signWalletMessage(message: string): Promise<`0x${string}`> {
  const client = await getWalletClient(wagmiConfig);
  if (!client) throw new Error("Wallet not connected");
  return client.signMessage({ message });
}
