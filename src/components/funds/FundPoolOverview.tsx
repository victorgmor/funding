import { useEffect, useState } from "react";
import type { Fund, Mandate, MandateTrade, VirtualPool } from "@/lib/funds/types";
import type { FundPoolPerformance } from "@/lib/funds/performance";
import type { FundSettlement } from "@/lib/funds/settlement";
import FundPnlChart from "@/components/funds/FundPnlChart";
import FundStageMetricsRow from "@/components/funds/FundStageMetricsRow";
import PoolCapBar from "@/components/funds/PoolCapBar";
import ProfitShareLabel from "@/components/funds/ProfitShareLabel";
import CreatorName from "@/components/creators/CreatorName";
import { formatUsdExact } from "@/lib/funds/format";
import { creatorPath } from "@/lib/funds/creator";
import { isFundOwner } from "@/lib/funds/editable";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { notifyPoolUpdated, POOL_UPDATED_EVENT } from "@/lib/funds/pool-events";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = { fund: Fund };

type PoolState = VirtualPool & {
  performance?: FundPoolPerformance | null;
  depositors?: (Mandate & { profileId: string })[];
};

type ActivityTab = "performance" | "predictions" | "depositors";

const sizeClass =
  "text-primary/70 shrink-0 text-right font-mono text-sm tabular-nums uppercase";

const depositSummaryClass =
  "text-primary/70 shrink-0 text-right font-mono text-sm tabular-nums";

function PredictionsList({
  trades,
  fundSlug,
  managerAddress,
  canRetry,
}: {
  trades: MandateTrade[];
  fundSlug: string;
  managerAddress?: string;
  canRetry: boolean;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (trades.length === 0) {
    return (
      <p className="text-primary/45 py-8 text-center text-sm">
        No predictions yet.
      </p>
    );
  }

  async function retryTrade(tradeId: string) {
    if (!managerAddress || retryingId) return;
    setRetryingId(tradeId);
    setRetryError(null);
    try {
      const res = await fetch(`/api/funds/${fundSlug}/trades/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, address: managerAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed");
      notifyPoolUpdated(fundSlug);
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      {retryError && (
        <p className="text-red-400 mb-2 text-xs">{retryError}</p>
      )}
      {trades.map((trade) => {
        const failed = trade.status === "failed";

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

              <div className="flex shrink-0 items-center gap-2">
                {failed && canRetry && (
                  <button
                    type="button"
                    disabled={retryingId === trade.id}
                    onClick={() => void retryTrade(trade.id)}
                    className="text-primary/60 hover:text-primary text-xs font-medium uppercase tracking-wide disabled:opacity-50"
                  >
                    {retryingId === trade.id ? "Retrying…" : "Retry"}
                  </button>
                )}
                <p
                  className={`${sizeClass} ${
                    failed ? "text-red-400" : "text-primary/70"
                  }`}
                >
                  {formatUsdExact(trade.usdcAmount)}{" "}
                  {failed ? "FAILED" : trade.side}
                </p>
              </div>
            </div>
            {failed && trade.detail && (
              <p className="text-red-400/80 mt-1.5 text-xs" title={trade.detail}>
                {trade.detail}
              </p>
            )}
          </article>
        );
      })}
    </>
  );
}

function DepositorsList({
  depositors,
  totalNotional,
}: {
  depositors: (Mandate & { profileId: string })[];
  totalNotional: number;
}) {
  if (depositors.length === 0) {
    return (
      <p className="text-primary/45 py-8 text-center text-sm">
        No depositors yet.
      </p>
    );
  }

  return (
    <>
      {depositors.map((mandate) => {
        const share =
          totalNotional > 0
            ? Math.round((mandate.notionalUsdc / totalNotional) * 100)
            : 0;

        return (
          <article
            key={mandate.id}
            className="border-primary/10 border-b py-3.5 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-4">
              <a
                href={creatorPath(mandate.profileId)}
                className="text-primary/80 hover:text-primary min-w-0 flex-1 truncate font-mono text-sm transition-colors"
              >
                <CreatorName
                  address={mandate.profileId}
                  fallback={
                    mandate.investorWallet.startsWith("0x")
                      ? addressDisplayFallback(mandate.investorWallet)
                      : mandate.investorWallet
                  }
                />
              </a>
              <p className={depositSummaryClass}>
                {formatUsdExact(mandate.notionalUsdc)}
                <span className="text-primary/45 ml-2">{share}%</span>
              </p>
            </div>
          </article>
        );
      })}
    </>
  );
}

function FundActivityTabs({
  fund,
  pool,
  closed,
  managerAddress,
  canRetry,
}: {
  fund: Fund;
  pool: PoolState;
  closed: boolean;
  managerAddress?: string;
  canRetry: boolean;
}) {
  const allTrades = pool.recentTrades ?? [];
  const chartTrades = allTrades.filter((trade) => trade.status === "filled");
  const predictions = allTrades
    .filter((trade) => trade.status === "filled" || trade.status === "failed")
    .slice(0, 8);
  const depositors = pool.depositors ?? [];
  const hasChart = chartTrades.length > 0;

  const [tab, setTab] = useState<ActivityTab>("performance");

  if (
    predictions.length === 0 &&
    !hasChart &&
    depositors.length === 0
  ) {
    if (closed) return null;
    return (
      <p className="text-primary/45 mt-6 border-t border-primary/10 pt-4 text-sm">
        No manager trades yet. Commit capital in the sidebar to join the fund.
      </p>
    );
  }

  const tabClass = (value: ActivityTab) =>
    `border-b-2 pb-2 text-sm transition-colors ${
      tab === value
        ? "border-primary text-primary font-medium"
        : "border-transparent text-primary/45 hover:text-primary/70"
    }`;

  return (
    <div className="border-primary/10 mt-6 border-t pt-4">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={() => setTab("performance")}
          className={tabClass("performance")}
        >
          Performance
        </button>
        <button
          type="button"
          onClick={() => setTab("predictions")}
          className={tabClass("predictions")}
        >
          Predictions
        </button>
        <button
          type="button"
          onClick={() => setTab("depositors")}
          className={tabClass("depositors")}
        >
          Depositors
        </button>
      </div>

      <div className="pt-3">
        {tab === "performance" &&
          (hasChart ? (
            <FundPnlChart
              embedded
              trades={chartTrades}
              fundCreatedAt={fund.createdAt}
            />
          ) : (
            <p className="text-primary/45 py-8 text-center text-sm">
              Not enough trade history for a performance chart yet.
            </p>
          ))}
        {tab === "predictions" && (
          <PredictionsList
            trades={predictions}
            fundSlug={fund.slug}
            managerAddress={managerAddress}
            canRetry={canRetry}
          />
        )}
        {tab === "depositors" && (
          <DepositorsList
            depositors={depositors}
            totalNotional={pool.totalNotional}
          />
        )}
      </div>
    </div>
  );
}

export default function FundPoolOverview({ fund }: Props) {
  const { address } = useWalletSession();
  const [pool, setPool] = useState<PoolState | null>(null);
  const [settlement, setSettlement] = useState<FundSettlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const closed = fund.status === "closed";
  const profitShare = fund.managerProfitSharePct ?? 0;
  const performance = pool?.performance ?? null;
  const pnlAmount = performance?.profitUsdc ?? null;
  const canRetry = !closed && isFundOwner(fund, address);

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

  // Deposited (PoolCapBar) = external commitments (notional, compounds on redeem).
  // AUM = mark-to-market pool value.
  // Deployable tracks AUM — profits stay in the pool / mandate.
  const aumUsdc = performance?.aumUsdc ?? pool.totalNotional;
  const deployableUsdc = Math.max(0, aumUsdc);

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
          {formatUsdExact(aumUsdc)}
        </span>{" "}
        AUM ·{" "}
        <span className="text-primary/70 font-medium">
          {formatUsdExact(deployableUsdc)}
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

      <FundActivityTabs
        fund={fund}
        pool={pool}
        closed={closed}
        managerAddress={address}
        canRetry={canRetry}
      />
    </div>
  );
}
