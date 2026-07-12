import CreatorAvatar from "@/components/creators/CreatorAvatar";
import PoolCapBar from "@/components/funds/PoolCapBar";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath, isCreatorWallet } from "@/lib/funds/creator";
import { isPaidFund } from "@/lib/funds/access";
import { formatPublishedAgo } from "@/lib/funds/format";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  deposited?: number;
  lead?: boolean;
  searchFocused?: boolean;
};

function feedSnippet(fund: Fund): string {
  const thesis = fund.thesis.trim();
  if (thesis) return thesis;
  return fund.description.trim();
}

export default function FundFeedCard({
  fund,
  deposited = 0,
  lead = false,
  searchFocused = false,
}: Props) {
  const paid = isPaidFund(fund);
  const snippet = feedSnippet(fund);
  const published = formatPublishedAgo(fund.createdAt);
  const showAvatar = isCreatorWallet(fund.manager.id);

  return (
    <article
      className={`border-primary/10 border-b py-8 last:border-b-0 ${
        lead
          ? `border-t transition-colors ${
              searchFocused ? "border-t-primary" : "border-t-primary/10"
            }`
          : ""
      }`}
    >
      <div className="mb-4 flex items-center gap-3">
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
        <h2 className="text-primary group-hover:text-primary/85 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {fund.name}
        </h2>

        {snippet && (
          <p className="text-primary/65 mt-3 line-clamp-3 text-base leading-relaxed">
            {snippet}
          </p>
        )}
      </a>

      <div className="mt-5 space-y-3">
        <PoolCapBar deposited={deposited} capUsdc={fund.capUsdc} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {paid ? (
            <span className="text-primary/55">
              ${fund.unlockPriceUsdc!.toFixed(2)} to unlock
            </span>
          ) : (
            <span className="text-primary/45">Free to read</span>
          )}
          <a
            href={`/funds/${fund.slug}`}
            className="text-primary/50 hover:text-primary ml-auto transition-colors"
          >
            View fund →
          </a>
        </div>
      </div>
    </article>
  );
}
