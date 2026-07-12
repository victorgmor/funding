import { useCallback, useEffect, useState } from "react";
import { POOL_UPDATED_EVENT } from "@/lib/funds/pool-events";

export type PoolTotalEntry = {
  deposited: number;
  profitUsdc: number | null;
  roiPct: number | null;
};

export function usePoolTotals() {
  const [totals, setTotals] = useState<Record<string, PoolTotalEntry>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/funds/pool-totals", { cache: "no-store" });
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
      await load();
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
  }, [load]);

  return { totals, loading, refresh: load };
}
