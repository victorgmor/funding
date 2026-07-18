/** Tiny in-memory TTL map. Miss → `undefined` (so `null` values can be cached). */
export function createTtlCache<T>(ttlMs: number) {
  const map = new Map<string, { value: T; exp: number }>();

  return {
    get(key: string): T | undefined {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.exp <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      map.set(key, { value, exp: Date.now() + ttlMs });
    },
    async getOrSet(key: string, load: () => Promise<T>): Promise<T> {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const value = await load();
      this.set(key, value);
      return value;
    },
  };
}
