/** In-flight + short TTL cache so Avatar/Name/nav don't triple-fetch the same profile. */
export type ClientPolymarketProfile = {
  name?: string | null;
  verified?: boolean;
  profileImage?: string | null;
};

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: ClientPolymarketProfile }>();
const inflight = new Map<string, Promise<ClientPolymarketProfile | null>>();

export function fetchClientPolymarketProfile(
  address: string,
): Promise<ClientPolymarketProfile | null> {
  const id = address.toLowerCase();
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Promise.resolve(hit.data);
  }

  const pending = inflight.get(id);
  if (pending) return pending;

  const request = fetch(
    `/api/polymarket/profile?address=${encodeURIComponent(address)}`,
  )
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as ClientPolymarketProfile;
      cache.set(id, { at: Date.now(), data });
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, request);
  return request;
}
