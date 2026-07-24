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
    <article className="border-primary/10 border-b first:border-t last:border-b-0">
      <div className="flex items-center gap-3 overflow-x-auto py-2.5 text-sm scrollbar-hide sm:gap-4">
        <a href={href} className="group flex min-w-0 shrink items-center gap-2">
          <h2 className="text-primary group-hover:text-primary/85 max-w-[10rem] truncate text-sm font-semibold tracking-tight sm:max-w-[14rem] sm:text-base">
            {fund.name}
          </h2>
          {snippet && (
            <span className="text-primary/45 hidden max-w-[12rem] truncate text-xs lg:inline">
              {snippet}
            </span>
          )}
        </a>

        <a href={href} className="shrink-0">
          <FundLifecycleTrack
            fund={fund}
            totalNotional={deposited}
            compact
          />
        </a>

        <a
          href={href}
          className="text-primary/70 hover:text-primary shrink-0 font-mono text-xs tabular-nums transition-colors sm:text-sm"
        >
          {depositLabel(deposited, fund.capUsdc)}
        </a>

        <a
          href={href}
          className={`shrink-0 font-mono text-xs tabular-nums sm:text-sm ${pnlColor}`}
        >
          {formatUsdExact(pnl, true)}
        </a>

        <a
          href={href}
          className="text-primary/55 hover:text-primary/70 shrink-0 font-mono text-xs tabular-nums transition-colors sm:text-sm"
        >
          {profitShare}%
        </a>

        <div className="text-primary/45 ml-auto flex min-w-0 shrink-0 items-center gap-1.5 text-xs sm:text-sm">
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
