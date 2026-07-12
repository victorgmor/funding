import { useEffect, useState } from "react";
import type { Fund, VirtualPool } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = { fund: Fund };

export default function FundPoolOverview({ fund }: Props) {
  const { address } = useWalletSession();
  const [pool, setPool] = useState<VirtualPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (address) params.set("address", address);
        const res = await fetch(`/api/funds/${fund.slug}/pool?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load pool");
        setPool(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load pool");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fund.slug, address]);

  if (loading) {
    return <p className="text-primary/50 text-sm">Loading pool…</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!pool) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
            Pool AUM
          </p>
          <p className="text-primary mt-1 font-mono text-2xl tabular-nums">
            ${pool.totalNotional.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
            Deployable
          </p>
          <p className="text-primary mt-1 font-mono text-2xl tabular-nums">
            ${pool.totalCash.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
            Investors
          </p>
          <p className="text-primary mt-1 font-mono text-2xl tabular-nums">
            {pool.mandateCount}
          </p>
        </div>
      </div>

      {pool.recentInstructions.length > 0 && (
        <div className="border-primary/10 rounded-lg border">
          <p className="text-primary/50 border-primary/10 border-b px-4 py-3 text-[0.65rem] font-medium uppercase">
            Recent trades
          </p>
          <ul className="divide-primary/10 divide-y text-sm">
            {pool.recentInstructions.slice(0, 8).map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <span className="text-primary/80 line-clamp-2">{row.question}</span>
                <span className="text-primary shrink-0 font-mono text-xs tabular-nums">
                  ${row.totalUsdc.toFixed(2)}{" "}
                  <span className="text-primary/50 uppercase">{row.side}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pool.recentInstructions.length === 0 && (
        <p className="text-primary/50 text-sm">
          No manager trades yet. Commit capital in the sidebar to join the fund.
        </p>
      )}
    </div>
  );
}
