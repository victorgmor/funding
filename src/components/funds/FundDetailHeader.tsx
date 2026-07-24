import { useEffect, useState } from "react";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
import { FUND_FEED_GRID } from "@/components/funds/FundFeedCard";
import FundLifecycleTrack from "@/components/funds/FundLifecycleTrack";
import PoolCapBar from "@/components/funds/PoolCapBar";
import SealCheck from "@/components/fundations/icons/SealCheck";
import Skeleton from "@/components/app/Skeleton";
import { creatorPath, isCreatorWallet } from "@/lib/funds/creator";
import {
  formatPercent,
  formatPublishedAgo,
  formatUsdExact,
} from "@/lib/funds/format";
import type { FundPoolPerformance } from "@/lib/funds/performance";
import { POOL_UPDATED_EVENT } from "@/lib/funds/pool-events";
import type { Fund, VirtualPool } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  fund: Fund;
  initialPerformance?: FundPoolPerformance | null;
};

type PoolState = VirtualPool & {
  performance?: FundPoolPerformance | null;
};

export default function FundDetailHeader({
  fund,
  initialPerformance = null,
}: Props) {
  const { address } = useWalletSession();
  const [pool, setPool] = useState<PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const showAvatar = isCreatorWallet(fund.manager.id);
  const published = formatPublishedAgo(fund.createdAt);
  const profitShare = fund.managerProfitSharePct ?? 0;
  const performance = pool?.performance ?? initialPerformance;
  const depositedUsdc =
    performance?.depositedUsdc ?? pool?.totalDeposited ?? pool?.totalNotional ?? 0;
  const deployableUsdc = Math.max(
    0,
    performance?.aumUsdc ?? pool?.totalNotional ?? depositedUsdc,
  );
  const pnl = performance?.profitUsdc ?? 0;
  const pnlColor =
    pnl === 0 ? "text-primary/45" : pnl > 0 ? "text-profit" : "text-red-500";
  const roi = performance?.roi ?? null;

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const slug = (event as CustomEvent<{ fundSlug?: string }>).detail
        ?.fundSlug;
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
      try {
        const params = new URLSearchParams();
        if (address) params.set("address", address);
        const res = await fetch(`/api/funds/${fund.slug}/pool?${params}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setPool(data);
      } catch {
        // keep initialPerformance
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fund.slug, address, refreshKey]);

  return (
    <article className="border-primary/10 border">
      <div className={`${FUND_FEED_GRID} gap-y-3 px-4 py-3 text-base sm:px-5`}>
        {/* Identity + stage */}
        <div className="min-w-0 space-y-1 leading-tight">
          <h1 className="text-primary truncate text-base font-semibold tracking-tight sm:text-lg">
            {fund.name}
          </h1>
          {fund.thesis.trim() && (
            <p className="text-primary/35 max-w-[28ch] truncate text-base">
              {fund.thesis}
            </p>
          )}
          <p className="text-primary/30 max-w-[18ch] truncate font-mono text-base tabular-nums">
            {fund.slug}
          </p>
          <FundLifecycleTrack
            fund={fund}
            totalNotional={depositedUsdc}
            compact
          />
        </div>

        {/* Manager */}
        <div className="text-primary/45 flex min-w-0 items-center gap-2 text-base sm:text-base">
          {showAvatar && (
            <a href={creatorPath(fund.manager.id)} className="shrink-0">
              <CreatorAvatar
                address={fund.manager.id}
                name={fund.manager.name}
                size="2xs"
              />
            </a>
          )}
          <div className="min-w-0 leading-tight">
            <a
              href={creatorPath(fund.manager.id)}
              className="text-primary/70 hover:text-primary inline-flex max-w-full items-center gap-0.5 truncate transition-colors"
            >
              <CreatorName
                address={fund.manager.id}
                fallback={fund.manager.name}
              />
              {fund.manager.verified && (
                <SealCheck
                  size="xs"
                  className="!size-3.5 shrink-0 text-[#288cbc]"
                />
              )}
            </a>
            {published && (
              <p className="text-primary/40 mt-0.5 truncate text-base">
                {published}
              </p>
            )}
          </div>
        </div>

        {/* Economics */}
        <div className="min-w-0 space-y-0.5 text-right font-mono text-base tabular-nums">
          {loading && !pool ? (
            <div className="space-y-1.5" aria-hidden>
              <Skeleton className="ml-auto h-3.5 w-24 rounded" />
              <Skeleton className="ml-auto h-3 w-28 rounded" />
              <Skeleton className="ml-auto h-3 w-16 rounded" />
            </div>
          ) : (
            <>
              <p className="text-primary/80 truncate">
                {formatUsdExact(depositedUsdc)}
                <span className="text-primary/45"> deposited</span>
              </p>
              <p className="text-primary/45 truncate">
                {formatUsdExact(deployableUsdc)}
                <span className="text-primary/35"> deployable</span>
                <span className="text-primary/35"> · </span>
                {profitShare}% share
              </p>
              <p className={`truncate ${pnlColor}`}>
                {formatUsdExact(pnl, true)}
                {roi != null && (
                  <span className="text-primary/45">
                    {" "}
                    · {formatPercent(roi)}
                  </span>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="border-primary/10 border-t px-4 py-3 sm:px-5">
        <PoolCapBar
          deposited={depositedUsdc}
          capUsdc={fund.capUsdc}
          trailing={
            pool ? (
              <span className="text-primary/45 font-mono text-base tabular-nums">
                {pool.mandateCount}{" "}
                {pool.mandateCount === 1 ? "investor" : "investors"}
              </span>
            ) : undefined
          }
        />
      </div>
    </article>
  );
}
