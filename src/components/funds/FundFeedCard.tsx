import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CurrencyDollarSimple from "@/components/fundations/icons/CurrencyDollarSimple";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath, isCreatorWallet } from "@/lib/funds/creator";
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
  const showAvatar = isCreatorWallet(fund.manager.id);

  return (
    <article className="border-primary/10 border-b py-7 last:border-b-0">
      <div className="mb-3 flex items-center gap-3">
        {showAvatar ? (
          <a href={creatorPath(fund.manager.id)} className="shrink-0">
            <CreatorAvatar
              address={fund.manager.id}
              name={fund.manager.name}
              size="sm"
            />
          </a>
        ) : (
          <div
            className="bg-primary/10 text-primary border-primary/10 flex size-10 shrink-0 items-center justify-center rounded-full border text-base font-semibold"
            aria-hidden
          >
            {fund.manager.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}

        <div className="text-primary/50 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <a
            href={creatorPath(fund.manager.id)}
            className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors"
          >
            {fund.manager.name}
            {fund.manager.verified && (
              <SealCheck size="sm" className="text-[#32BCFF]" />
            )}
          </a>
          {published && (
            <>
              <span aria-hidden>·</span>
              <span>{published}</span>
            </>
          )}
        </div>
      </div>

      <a href={`/funds/${fund.slug}`} className="group block">
        <h2 className="text-primary group-hover:text-primary/85 flex items-center gap-2 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {paid && (
            <CurrencyDollarSimple
              size="sm"
              className="text-accent shrink-0"
              aria-hidden
            />
          )}
          <span>{fund.name}</span>
        </h2>

        {snippet && (
          <p className="text-primary/55 mt-2 line-clamp-2 text-sm leading-relaxed sm:text-base">
            {snippet}
          </p>
        )}
      </a>

      <div className="mt-4 flex items-center gap-x-3 text-sm">
        <span className="text-primary/45">{marketLabel}</span>
        {paid ? (
          <span className="text-primary/45">
            ${fund.unlockPriceUsdc!.toFixed(2)} to unlock
          </span>
        ) : (
          <span className="text-primary/45">Free to read</span>
        )}
        <a
          href={`/funds/${fund.slug}`}
          className="text-primary/50 hover:text-primary ml-auto transition-colors"
        >
          Read call →
        </a>
      </div>
    </article>
  );
}
