import type { Address } from "viem";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

export async function fetchSafeAddress(owner: Address): Promise<Address | null> {
  const res = await fetch(`${RELAYER_URL}/address?owner=${owner}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { address?: string };
  if (!data.address || !/^0x[a-fA-F0-9]{40}$/i.test(data.address)) return null;
  return data.address as Address;
}
