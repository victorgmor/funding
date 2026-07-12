import { fetchErrorMessage } from "@/lib/fetch-error";

const CLOB_HOST = "https://clob.polymarket.com";

export async function fetchTokenMidPrice(tokenId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${CLOB_HOST}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { mid?: string };
    const mid = parseFloat(data.mid ?? "");
    if (!Number.isFinite(mid) || mid <= 0) return null;
    return Math.min(0.99, Math.max(0.01, mid));
  } catch {
    return null;
  }
}

export async function fetchTokenMidPrices(
  tokenIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(tokenIds)];
  const prices = new Map<string, number>();

  await Promise.all(
    unique.map(async (tokenId) => {
      try {
        const mid = await fetchTokenMidPrice(tokenId);
        if (mid != null) prices.set(tokenId, mid);
      } catch (error) {
        throw new Error(
          fetchErrorMessage(error, "Could not fetch position prices"),
        );
      }
    }),
  );

  return prices;
}
