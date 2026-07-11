import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import { isPaidFund } from "@/lib/funds/access";
import { formatPublishedAgo } from "@/lib/funds/format";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
};

function feedSnippet(fund: Fund): string {
  const thesis = fund.thesis.trim();
  if (thesis) return thesis;
  return fund.description.trim();
}

export default function FundFeedCard({ fund }: Props) {
  const paid = isPaidFund(fund);
  const snippet = feedSnippet(fund);
  const published = formatPublishedAgo(fund.createdAt);
  const marketCount = fund.markets.length;
  const marketLabel = `${marketCount} market${marketCount === 1 ? "" : "s"}`;

  return (
    <article className="bg-primary/5 hover:bg-primary/8 rounded-lg px-4 py-4 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {published && (
            <p className="text-primary/40 mb-2 text-[0.65rem] font-medium uppercase">
              Published {published}
            </p>
          )}

          <a
            href={`/funds/${fund.slug}`}
            className="text-primary hover:text-primary/80 text-base font-medium"
          >
            {fund.name}
          </a>

          {snippet && (
            <p className="text-primary/60 mt-2 line-clamp-2 text-sm leading-relaxed">
              {snippet}
            </p>
          )}

          <p className="text-primary/50 mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <a
              href={creatorPath(fund.manager.id)}
              className="text-primary/70 hover:text-primary inline-flex items-center gap-1 transition-colors"
            >
              {fund.manager.name}
              {fund.manager.verified && (
                <SealCheck size="sm" className="text-[#32BCFF]" />
              )}
            </a>
            <span aria-hidden className="text-primary/30">
              ·
            </span>
            <span>{marketLabel}</span>
            {paid && (
              <>
                <span aria-hidden className="text-primary/30">
                  ·
                </span>
                <span className="text-primary/70">
                  {marketCount} markets locked · Unlock for $
                  {fund.unlockPriceUsdc!.toFixed(2)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={
              paid
                ? "text-primary text-sm font-medium tabular-nums"
                : "text-primary/50 text-sm"
            }
          >
            {paid ? `Unlock · $${fund.unlockPriceUsdc!.toFixed(2)}` : "Free"}
          </span>
          <a
            href={`/funds/${fund.slug}`}
            className="text-primary/50 hover:text-primary text-xs transition-colors"
          >
            Read call →
          </a>
        </div>
      </div>
    </article>
  );
}
