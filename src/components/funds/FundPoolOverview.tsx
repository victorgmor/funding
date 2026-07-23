import { useEffect, useMemo, useState } from "react";
import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  VirtualPool,
} from "@/lib/funds/types";
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
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import { readResponseJson } from "@/lib/fetch-json";

type Props = { fund: Fund };

type PoolState = VirtualPool & {
  performance?: FundPoolPerformance | null;
  depositors?: (Mandate & { profileId: string })[];
};

type ActivityTab = "performance" | "positions" | "history" | "depositors";

type OpenPositionRow = {
  tokenId: string;
  question: string;
  side: string;
  shares: number;
  costUsdc: number;
};

const sizeClass =
  "text-primary/70 shrink-0 text-right font-mono text-sm tabular-nums uppercase";

const depositSummaryClass =
  "text-primary/70 shrink-0 text-right font-mono text-sm tabular-nums";

function aggregateOpenPositions(
  positions: MandatePosition[] | undefined,
): OpenPositionRow[] {
  const byToken = new Map<string, OpenPositionRow>();
  for (const pos of positions ?? []) {
    if (pos.redeemedAt || pos.shares <= 0) continue;
    const existing = byToken.get(pos.tokenId);
    if (existing) {
      existing.shares += pos.shares;
      existing.costUsdc += pos.costUsdc;
    } else {
      byToken.set(pos.tokenId, {
        tokenId: pos.tokenId,
        question: pos.question,
        side: pos.side,
        shares: pos.shares,
        costUsdc: pos.costUsdc,
      });
    }
  }
  return [...byToken.values()].sort((a, b) => b.costUsdc - a.costUsdc);
}

function HistoryList({
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
        No trade history yet.
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
                  {failed
                    ? "FAILED"
                    : trade.orderSide === "SELL"
                      ? `SELL ${trade.side}`
                      : trade.side}
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

function PositionsList({
  positions,
  fundSlug,
  canSell,
  managerAddress,
}: {
  positions: OpenPositionRow[];
  fundSlug: string;
  canSell: boolean;
  managerAddress?: string;
}) {
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <p className="text-primary/45 py-8 text-center text-sm">
        No open positions.
      </p>
    );
  }

  async function sellPosition(row: OpenPositionRow) {
    if (!canSell || !managerAddress || sellingId) return;
    setSellingId(row.tokenId);
    setError(null);
    try {
      // Ask for full position; server clamps to mid × shares.
      const totalUsdc = Math.max(1, Math.round(row.shares * 99) / 100);
      const draft = {
        tokenId: row.tokenId,
        side: row.side,
        totalUsdc,
        orderSide: "SELL" as const,
      };

      const previewRes = await fetch(`/api/funds/${fundSlug}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress,
          trades: [draft],
          dryRun: true,
        }),
      });
      const preview = await readResponseJson<{
        error?: string;
        trades?: Array<{
          tokenId: string;
          side: string;
          totalUsdc: number;
        }>;
      }>(previewRes);
      if (!previewRes.ok) throw new Error(preview.error ?? "Sell preview failed");
      const planned = preview.trades?.[0];
      if (!planned) throw new Error("Sell preview failed");

      const challengeParams = new URLSearchParams({
        address: managerAddress,
        action: "instruct",
        slug: fundSlug,
      });
      const challengeRes = await fetch(
        `/api/auth/bundle-challenge?${challengeParams}`,
      );
      const challenge = await readResponseJson<{
        error?: string;
        message?: string;
      }>(challengeRes);
      if (!challengeRes.ok) {
        throw new Error(challenge.error ?? "Could not start signing");
      }
      const signature = await signWalletMessage(challenge.message as string);

      const execRes = await fetch(`/api/funds/${fundSlug}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress,
          message: challenge.message,
          signature,
          trades: [
            {
              tokenId: planned.tokenId,
              side: planned.side,
              totalUsdc: planned.totalUsdc,
              orderSide: "SELL",
            },
          ],
          execute: true,
        }),
      });
      const exec = await readResponseJson<{ error?: string }>(execRes);
      if (!execRes.ok) throw new Error(exec.error ?? "Sell failed");

      notifyPoolUpdated(fundSlug);
      window.setTimeout(() => notifyPoolUpdated(fundSlug), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sell failed");
    } finally {
      setSellingId(null);
    }
  }

  return (
    <>
      {error && <p className="text-red-400 mb-2 text-xs">{error}</p>}
      {positions.map((row) => (
        <article
          key={row.tokenId}
          className="border-primary/10 border-b py-3.5 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-4">
            <p
              className="text-primary/80 min-w-0 flex-1 truncate text-sm"
              title={row.question}
            >
              {row.question}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {canSell && (
                <button
                  type="button"
                  disabled={sellingId === row.tokenId}
                  onClick={() => void sellPosition(row)}
                  className="text-primary/60 hover:text-primary text-xs font-medium uppercase tracking-wide disabled:opacity-50"
                >
                  {sellingId === row.tokenId ? "Selling…" : "Sell"}
                </button>
              )}
              <p className={sizeClass}>
                {formatUsdExact(row.costUsdc)} {row.side}
              </p>
            </div>
          </div>
          <p className="text-primary/45 mt-1 font-mono text-xs tabular-nums">
            {row.shares.toFixed(2)} shares
          </p>
        </article>
      ))}
    </>
  );
}

function DepositorsList({
  depositors,
  totalDeposited,
}: {
  depositors: (Mandate & { profileId: string })[];
  totalDeposited: number;
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
        const deposited = mandate.depositedUsdc ?? mandate.notionalUsdc;
        const share =
          totalDeposited > 0
            ? Math.round((deposited / totalDeposited) * 100)
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
                {formatUsdExact(deposited)}
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
  const history = allTrades
    .filter((trade) => trade.status === "filled" || trade.status === "failed")
    .slice(0, 8);
  const depositors = pool.depositors ?? [];
  const openPositions = useMemo(
    () => aggregateOpenPositions(pool.positions),
    [pool.positions],
  );
  const hasChart = chartTrades.length > 0;
  const canSell = canRetry && fund.status === "trading";

  const [tab, setTab] = useState<ActivityTab>(
    openPositions.length > 0 ? "positions" : "performance",
  );

  if (
    history.length === 0 &&
    !hasChart &&
    depositors.length === 0 &&
    openPositions.length === 0
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
          onClick={() => setTab("positions")}
          className={tabClass("positions")}
        >
          Positions
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={tabClass("history")}
        >
          History
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
        {tab === "positions" && (
          <PositionsList
            positions={openPositions}
            fundSlug={fund.slug}
            canSell={canSell}
            managerAddress={managerAddress}
          />
        )}
        {tab === "history" && (
          <HistoryList
            trades={history}
            fundSlug={fund.slug}
            managerAddress={managerAddress}
            canRetry={canRetry}
          />
        )}
        {tab === "depositors" && (
          <DepositorsList
            depositors={depositors}
            totalDeposited={pool.totalDeposited ?? pool.totalNotional}
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

  // Deposited = external capital. Deployable = live pool mark (not deposited + chart PnL).
  const depositedUsdc =
    performance?.depositedUsdc ?? pool.totalDeposited ?? pool.totalNotional;
  const deployableUsdc = Math.max(
    0,
    performance?.aumUsdc ?? pool.totalNotional ?? depositedUsdc,
  );

  return (
    <div>
      <div className="space-y-2">
        <FundStageMetricsRow
          fund={fund}
          profitUsdc={pnlAmount}
          totalNotional={depositedUsdc}
        />
        <PoolCapBar
          deposited={depositedUsdc}
          capUsdc={fund.capUsdc}
          trailing={<ProfitShareLabel pct={profitShare} />}
        />
      </div>

      <p className="text-primary/45 mt-2.5 font-mono text-xs tabular-nums">
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
