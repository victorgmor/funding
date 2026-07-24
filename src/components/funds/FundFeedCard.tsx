import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
import FundLifecycleTrack from "@/components/funds/FundLifecycleTrack";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import {
  capProgress,
  formatPublishedAgo,
  formatUsdExact,
} from "@/lib/funds/format";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  deposited?: number;
  profitUsdc?: number | null;
};

/** Shared with FundListPanel header / skeleton so columns line up. */
export const FUND_FEED_GRID =
  "grid items-start gap-x-4 [grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-x-6";

function feedSnippet(fund: Fund): string {
  const thesis = fund.thesis.trim();
  if (thesis) return thesis;
  return fund.description.trim();
}

export default function FundFeedCard({
  fund,
  deposited = 0,
  profitUsdc = null,
}: Props) {
  const snippet = feedSnippet(fund);
  const published = formatPublishedAgo(fund.createdAt);
  const profitShare = fund.managerProfitSharePct ?? 0;
  const pnl = profitUsdc ?? 0;
  const pnlColor =
    pnl === 0 ? "text-primary/45" : pnl > 0 ? "text-profit" : "text-red-500";
  const href = `/funds/${fund.slug}`;
  const fillPct =
    fund.capUsdc != null && fund.capUsdc > 0
      ? capProgress(deposited, fund.capUsdc)
      : null;

  return (
    <article className="border-primary/10 border-b last:border-b-0">
      <div className={`${FUND_FEED_GRID} py-3 text-sm`}>
        {/* Latest — identity + stage */}
        <a href={href} className="group min-w-0 space-y-1 leading-tight">
          <h2 className="text-primary group-hover:text-primary/85 truncate text-sm font-semibold tracking-tight sm:text-base">
            {fund.name}
          </h2>
          {snippet && (
            <p className="text-primary/45 truncate text-xs">{snippet}</p>
          )}
          <FundLifecycleTrack
            fund={fund}
            totalNotional={deposited}
            compact
          />
        </a>

        {/* Managers */}
        <div className="text-primary/45 flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <a href={creatorPath(fund.manager.id)} className="shrink-0">
            <CreatorAvatar
              address={fund.manager.id}
              name={fund.manager.name}
              size="2xs"
            />
          </a>
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
              <p className="text-primary/40 mt-0.5 truncate text-xs">
                {published}
              </p>
            )}
          </div>
        </div>

        {/* Pool cap — economics */}
        <a
          href={href}
          className="hover:text-primary min-w-0 space-y-0.5 font-mono text-xs tabular-nums transition-colors sm:text-sm"
        >
          <p className="text-primary/70 truncate">
            {formatUsdExact(deposited)}
            {fillPct != null && (
              <span className="text-primary/45"> · {fillPct}%</span>
            )}
          </p>
          <p className="text-primary/45 truncate">
            {fund.capUsdc != null && fund.capUsdc > 0
              ? `Cap ${formatUsdExact(fund.capUsdc)}`
              : "Uncapped"}
            <span className="text-primary/35"> · </span>
            {profitShare}%
          </p>
          <p className={`truncate ${pnlColor}`}>
            {formatUsdExact(pnl, true)}
          </p>
        </a>
      </div>
    </article>
  );
}
