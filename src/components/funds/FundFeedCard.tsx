import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
import FundLifecycleTrack from "@/components/funds/FundLifecycleTrack";
import FundPerformanceCell from "@/components/funds/FundPerformanceCell";
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
  roiPct?: number | null;
};

/** Shared with FundListPanel header / skeleton so columns line up. */
export const FUND_FEED_GRID =
  "grid items-center gap-x-3 [grid-template-columns:minmax(8rem,1.5fr)_minmax(5.5rem,0.85fr)_minmax(5.5rem,0.9fr)_minmax(4.5rem,0.7fr)_minmax(5rem,0.85fr)_minmax(4rem,0.65fr)_minmax(3.5rem,0.5fr)_minmax(4.5rem,0.7fr)_minmax(3.5rem,0.55fr)]";

function feedSnippet(fund: Fund): string {
  const thesis = fund.thesis.trim();
  if (thesis) return thesis;
  return fund.description.trim();
}

function CommitProgress({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-primary/30 text-right text-xs">—</span>;
  }

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-primary/80 text-right font-mono text-xs tabular-nums">
        {pct}%
      </p>
      <div
        className="bg-primary/10 h-1 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% committed`}
      >
        <div
          className="bg-accent h-full rounded-full transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function FundFeedCard({
  fund,
  deposited = 0,
  roiPct = null,
}: Props) {
  const snippet = feedSnippet(fund);
  const published = formatPublishedAgo(fund.createdAt);
  const profitShare = fund.managerProfitSharePct ?? 0;
  const href = `/funds/${fund.slug}`;
  const fillPct =
    fund.capUsdc != null && fund.capUsdc > 0
      ? capProgress(deposited, fund.capUsdc)
      : null;

  return (
    <article className="border-primary/10 hover:bg-primary/[0.03] border-b last:border-b-0">
      <div className={`${FUND_FEED_GRID} py-2 text-sm`}>
        <a href={href} className="group min-w-0 space-y-0.5 leading-tight">
          <h2 className="text-primary group-hover:text-primary/85 truncate text-sm font-semibold tracking-tight">
            {fund.name}
          </h2>
          {snippet && (
            <p className="text-primary/35 max-w-[28ch] truncate text-[11px]">
              {snippet}
            </p>
          )}
        </a>

        <a href={href} className="min-w-0">
          <FundLifecycleTrack
            fund={fund}
            totalNotional={deposited}
            compact
          />
        </a>

        <div className="text-primary/45 flex min-w-0 items-center gap-1.5 text-xs">
          <a href={creatorPath(fund.manager.id)} className="shrink-0">
            <CreatorAvatar
              address={fund.manager.id}
              name={fund.manager.name}
              size="2xs"
            />
          </a>
          <a
            href={creatorPath(fund.manager.id)}
            className="text-primary/70 hover:text-primary inline-flex min-w-0 items-center gap-0.5 truncate transition-colors"
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
        </div>

        <a
          href={href}
          className="text-primary/80 text-right font-mono text-xs tabular-nums"
        >
          {formatUsdExact(deposited)}
        </a>

        <a href={href} className="min-w-0">
          <CommitProgress pct={fillPct} />
        </a>

        <a
          href={href}
          className="text-primary/70 text-right font-mono text-xs tabular-nums"
        >
          {fund.capUsdc != null && fund.capUsdc > 0
            ? formatUsdExact(fund.capUsdc)
            : "—"}
        </a>

        <a
          href={href}
          className="text-primary/60 text-right font-mono text-xs tabular-nums"
        >
          {profitShare}%
        </a>

        <a href={href} className="flex justify-end">
          {/* ponytail: ROI % via existing cell; $ PnL stays on fund detail */}
          <FundPerformanceCell fundSlug={fund.slug} roi={roiPct} />
        </a>

        <a
          href={href}
          className="text-primary/45 truncate text-xs tabular-nums"
        >
          {published ?? "—"}
        </a>
      </div>
    </article>
  );
}
