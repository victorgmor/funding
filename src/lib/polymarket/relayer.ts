import type { Address } from "viem";

const RELAYER_URL = "https://relayer-v2.polymarket.com";

export async function fetchRelayer(
  endpoint: string,
  params: Record<string, string>,
): Promise<Response> {
  const qs = new URLSearchParams(params);
  if (typeof window !== "undefined") {
    qs.set("endpoint", endpoint);
    return fetch(`/api/polymarket/relayer/fetch?${qs}`);
  }
  return fetch(`${RELAYER_URL}/${endpoint}?${qs}`);
}

export async function fetchSafeAddress(owner: Address): Promise<Address | null> {
  const res = await fetchRelayer("address", { owner });
  if (!res.ok) return null;
  const data = (await res.json()) as { address?: string };
  if (!data.address || !/^0x[a-fA-F0-9]{40}$/i.test(data.address)) return null;
  return data.address as Address;
}
