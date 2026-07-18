import { useEffect, useState } from "react";
import type { Fund, MandateTrade, VirtualPool } from "@/lib/funds/types";
import type { FundPoolPerformance } from "@/lib/funds/performance";
import type { FundSettlement } from "@/lib/funds/settlement";
import FundStageMetricsRow from "@/components/funds/FundStageMetricsRow";
import PnlAmount from "@/components/funds/PnlAmount";
import PoolCapBar from "@/components/funds/PoolCapBar";
import ProfitShareLabel from "@/components/funds/ProfitShareLabel";
import { formatUsdExact } from "@/lib/funds/format";
import { POOL_UPDATED_EVENT } from "@/lib/funds/pool-events";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = { fund: Fund };

const headerClass =
  "text-primary/45 text-xs font-medium uppercase tracking-wide";

const sizeClass =
  "text-primary/70 w-24 shrink-0 text-right font-mono text-sm tabular-nums uppercase sm:w-28";

const pnlClass = "w-28 shrink-0 text-right sm:w-32";

function RecentTradesList({ trades }: { trades: MandateTrade[] }) {
  return (
    <div className="border-primary/10 mt-6 border-t pt-4">
      <p className="text-primary mb-3 text-sm font-medium">Recent trades</p>

      <div className="border-primary/10 flex items-center justify-between gap-4 border-b pb-2">
        <p className={`${headerClass} min-w-0 flex-1`}>Market</p>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <p className={`${headerClass} ${sizeClass}`}>Size</p>
          <p className={`${headerClass} ${pnlClass}`}>PnL</p>
        </div>
      </div>

      {trades.map((trade) => {
        const failed = trade.status === "failed";
        const pnl = trade.pnlUsdc;
        const showPnl = !failed && pnl != null;

        return (
          <article
            key={trade.id}
            className="border-primary/10 border-b py-3.5 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-4">
              <p
                className={`min-w-0 flex-1 truncate text-sm ${
                  failed ? "text-red-400" : "text-primary/80"
                }`}
                title={trade.question}
              >
                {trade.question}
              </p>

              <div className="flex shrink-0 items-center gap-4 sm:gap-6">
                <p
                  className={`${sizeClass} ${
                    failed ? "text-red-400" : "text-primary/70"
                  }`}
                >
                  {formatUsdExact(trade.usdcAmount)}{" "}
                  {failed ? "FAILED" : trade.side}
                </p>
                <div className={pnlClass}>
                  {showPnl ? (
                    <PnlAmount amount={pnl} />
                  ) : (
                    <span className="text-primary/30 font-mono text-sm">—</span>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function FundPoolOverview({ fund }: Props) {
  const { address } = useWalletSession();
  const [pool, setPool] = useState<
    (VirtualPool & { performance?: FundPoolPerformance | null }) | null
  >(null);
  const [settlement, setSettlement] = useState<FundSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const closed = fund.status === "closed";
  const profitShare = fund.managerProfitSharePct ?? 0;
  const performance = pool?.performance ?? null;
  const pnlAmount = performance?.profitUsdc ?? null;

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const slug = (event as CustomEvent<{ fundSlug?: string }>).detail?.fundSlug;
      if (!slug || slug === fund.slug) {
        setRefreshKey((key) => key + 1);
      }
    };
    window.addEventListener(POOL_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(POOL_UPDATED_EVENT, onUpdate);
  }, [fund.slug]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (address) params.set("address", address);

        const requests: Promise<Response>[] = [
          fetch(`/api/funds/${fund.slug}/pool?${params}`, { cache: "no-store" }),
        ];
        if (closed) {
          requests.push(fetch(`/api/funds/${fund.slug}/settlement`));
        }

        const [poolRes, settlementRes] = await Promise.all(requests);
        const poolData = await poolRes.json();
        if (cancelled) return;
        if (!poolRes.ok) throw new Error(poolData.error ?? "Could not load pool");
        setPool(poolData);

        if (settlementRes) {
          const settlementData = await settlementRes.json();
          if (!cancelled && settlementRes.ok) {
            setSettlement(settlementData.settlement ?? null);
          }
        }
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
  }, [fund.slug, address, closed, refreshKey]);

  if (loading) {
    return <p className="text-primary/50 text-sm">Loading pool…</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!pool) return null;

  return (
    <div>
      <div className="space-y-2">
        <FundStageMetricsRow
          fund={fund}
          profitUsdc={pnlAmount}
          totalNotional={pool.totalNotional}
        />
        <PoolCapBar
          deposited={pool.totalNotional}
          capUsdc={fund.capUsdc}
          trailing={<ProfitShareLabel pct={profitShare} />}
        />
      </div>

      <p className="text-primary/45 mt-2.5 font-mono text-xs tabular-nums">
        <span className="text-primary/70 font-medium">
          {formatUsdExact(pool.totalNotional)}
        </span>{" "}
        AUM ·{" "}
        <span className="text-primary/70 font-medium">
          {formatUsdExact(pool.totalCash)}
        </span>{" "}
        deployable · {pool.mandateCount}{" "}
        {pool.mandateCount === 1 ? "investor" : "investors"}
      </p>

      {closed && settlement && (
        <div className="border-primary/10 mt-4 border-t pt-4">
          <p className="text-primary/45 text-xs uppercase tracking-wide">
            Close settlement
          </p>
          <p className="text-primary/45 mt-1.5 font-mono text-xs tabular-nums">
            <span className="text-primary/70 font-medium">
              {formatUsdExact(settlement.totalProfitUsdc)}
            </span>{" "}
            profit ·{" "}
            <span className="text-primary/70 font-medium">
              {formatUsdExact(settlement.totalManagerShareUsdc)}
            </span>{" "}
            manager share ({settlement.managerProfitSharePct}%) ·{" "}
            {settlement.mandates.length} mandates settled
          </p>
        </div>
      )}

      {(() => {
        const tradeRows = (pool.recentTrades ?? [])
          .filter((trade) => trade.status === "filled" || trade.status === "failed")
          .slice(0, 8);

        if (tradeRows.length === 0) {
          if (closed) return null;
          return (
            <p className="text-primary/45 mt-6 border-t border-primary/10 pt-4 text-sm">
              No manager trades yet. Commit capital in the sidebar to join the fund.
            </p>
          );
        }

        return <RecentTradesList trades={tradeRows} />;
      })()}
    </div>
  );
}
