import { useEffect, useState } from "react";

export function usePoolTotals() {
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/funds/pool-totals");
        const data = await res.json();
        if (!cancelled && res.ok) {
          setTotals(data as Record<string, number>);
        }
      } catch {
        // Feed still works without pool totals.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { totals, loading };
}
