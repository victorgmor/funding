const CLOB_HOST = "https://clob.polymarket.com";

type HistoryPoint = { t: number; p: number };

/** Price for a token at or just before `at`. */
export async function fetchTokenPriceAt(
  tokenId: string,
  at: Date,
): Promise<number | null> {
  const target = Math.floor(at.getTime() / 1000);
  const windowSec = 6 * 60 * 60;
  const params = new URLSearchParams({
    market: tokenId,
    startTs: String(target - windowSec),
    endTs: String(target + windowSec),
    fidelity: "60",
  });

  const res = await fetch(`${CLOB_HOST}/prices-history?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as { history?: HistoryPoint[] };
  const history = data.history ?? [];
  if (!history.length) return null;

  const atOrBefore = history
    .filter((point) => point.t <= target)
    .sort((a, b) => b.t - a.t);
  if (atOrBefore.length) return atOrBefore[0]!.p;

  return history.sort((a, b) => a.t - b.t)[0]!.p;
}
