import { useCallback, useEffect, useState } from "react";
import { POOL_UPDATED_EVENT } from "@/lib/funds/pool-events";
import type { PoolTotalEntry } from "@/lib/funds/performance";

export type { PoolTotalEntry };

export function usePoolTotals(
  initial?: Record<string, PoolTotalEntry>,
) {
  const [totals, setTotals] = useState<Record<string, PoolTotalEntry>>(
    () => initial ?? {},
  );
  const [loading, setLoading] = useState(!initial);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/funds/pool-totals");
      const data = await res.json();
      if (res.ok) {
        setTotals(data as Record<string, PoolTotalEntry>);
      }
    } catch {
      // Feed still works without pool totals.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // SSR seed is enough for first paint; refresh only on pool updates.
      if (!initial) await load();
      if (cancelled) return;
    }

    void run();

    const onUpdate = () => {
      void load();
    };
    window.addEventListener(POOL_UPDATED_EVENT, onUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(POOL_UPDATED_EVENT, onUpdate);
    };
  }, [load, initial]);

  return { totals, loading, refresh: load };
}
