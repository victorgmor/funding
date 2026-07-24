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
  "grid items-center gap-x-3 [grid-template-columns:minmax(0,1.5fr)_8.5rem_7rem_5rem_3rem_minmax(7.5rem,1fr)] sm:gap-x-4";

function feedSnippet(fund: Fund): string {
  const thesis = fund.thesis.trim();
  if (thesis) return thesis;
  return fund.description.trim();
}

function depositLabel(deposited: number, capUsdc?: number | null): string {
  const amount = formatUsdExact(deposited);
  if (capUsdc == null || capUsdc <= 0) return amount;
  return `${amount} · ${capProgress(deposited, capUsdc)}%`;
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

  return (
    <article className="border-primary/10 border-b last:border-b-0">
      <div className={`${FUND_FEED_GRID} py-2.5 text-sm`}>
        <a href={href} className="group min-w-0 leading-tight">
          <h2 className="text-primary group-hover:text-primary/85 truncate text-sm font-semibold tracking-tight sm:text-base">
            {fund.name}
          </h2>
          {snippet && (
            <p className="text-primary/45 mt-0.5 truncate text-xs">{snippet}</p>
          )}
        </a>

        <a href={href} className="min-w-0">
          <FundLifecycleTrack
            fund={fund}
            totalNotional={deposited}
            compact
          />
        </a>

        <a
          href={href}
          className="text-primary/70 hover:text-primary truncate font-mono text-xs tabular-nums transition-colors sm:text-sm"
        >
          {depositLabel(deposited, fund.capUsdc)}
        </a>

        <a
          href={href}
          className={`truncate font-mono text-xs tabular-nums sm:text-sm ${pnlColor}`}
        >
          {formatUsdExact(pnl, true)}
        </a>

        <a
          href={href}
          className="text-primary/55 hover:text-primary/70 font-mono text-xs tabular-nums transition-colors sm:text-sm"
        >
          {profitShare}%
        </a>

        <div className="text-primary/45 flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
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
              <SealCheck size="xs" className="!size-3.5 shrink-0 text-[#288cbc]" />
            )}
          </a>
          {published && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 whitespace-nowrap">{published}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
