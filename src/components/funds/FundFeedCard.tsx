import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import {
  capProgress,
  formatPublishedAgo,
  formatUsdExact,
} from "@/lib/funds/format";
import {
  resolveLifecycleStage,
  type LifecycleStage,
} from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  deposited?: number;
  profitUsdc?: number | null;
};

const STAGE_LABEL: Record<LifecycleStage, string> = {
  deposit: "Deposit",
  trading: "Trading",
  closed: "Closed",
};

/** Shared with FundListPanel header / skeleton so columns line up. */
export const FUND_FEED_GRID =
  "grid items-center gap-x-2 px-2 [grid-template-columns:minmax(7rem,1.6fr)_minmax(4rem,0.65fr)_minmax(4.5rem,0.7fr)_minmax(3rem,0.45fr)_minmax(4.5rem,0.7fr)_minmax(3.5rem,0.5fr)_minmax(5rem,0.9fr)_minmax(3.5rem,0.55fr)]";

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
  const stage = resolveLifecycleStage(fund, Date.now(), deposited);

  return (
    <div className="border-primary/10 hover:bg-primary/5 border-b last:border-b-0">
      <div className={`${FUND_FEED_GRID} py-2 text-xs`}>
        <a href={href} className="group min-w-0 leading-tight">
          <span className="text-primary group-hover:text-primary/85 block truncate font-medium">
            {fund.name}
          </span>
          {snippet ? (
            <span className="text-primary/45 block truncate">{snippet}</span>
          ) : null}
        </a>

        <a href={href} className="text-primary/70 truncate">
          {STAGE_LABEL[stage]}
        </a>

        <a
          href={href}
          className="text-primary/70 text-right font-mono tabular-nums hover:text-primary"
        >
          {formatUsdExact(deposited)}
        </a>

        <a
          href={href}
          className="text-primary/60 text-right font-mono tabular-nums"
        >
          {fillPct != null ? `${fillPct}%` : "—"}
        </a>

        <a
          href={href}
          className={`text-right font-mono tabular-nums ${pnlColor}`}
        >
          {formatUsdExact(pnl, true)}
        </a>

        <a
          href={href}
          className="text-primary/60 text-right font-mono tabular-nums"
        >
          {profitShare}%
        </a>

        <a
          href={creatorPath(fund.manager.id)}
          className="flex min-w-0 items-center gap-1.5"
        >
          <CreatorAvatar
            address={fund.manager.id}
            name={fund.manager.name}
            size="2xs"
          />
          <span className="text-primary/70 inline-flex min-w-0 items-center gap-0.5 truncate">
            <CreatorName
              address={fund.manager.id}
              fallback={fund.manager.name}
            />
            {fund.manager.verified && (
              <SealCheck
                size="xs"
                className="!size-3 shrink-0 text-[#288cbc]"
              />
            )}
          </span>
        </a>

        <a href={href} className="text-primary/45 truncate tabular-nums">
          {published ?? "—"}
        </a>
      </div>
    </div>
  );
}
