import CreatorAvatar from "@/components/creators/CreatorAvatar";
import FundStageMetricsRow from "@/components/funds/FundStageMetricsRow";
import PoolCapBar from "@/components/funds/PoolCapBar";
import ProfitShareLabel from "@/components/funds/ProfitShareLabel";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath, isCreatorWallet } from "@/lib/funds/creator";
import { formatPublishedAgo } from "@/lib/funds/format";
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

export default function FundFeedCard({
  fund,
  deposited = 0,
  profitUsdc = null,
}: Props) {
  const snippet = feedSnippet(fund);
  const published = formatPublishedAgo(fund.createdAt);
  const showAvatar = isCreatorWallet(fund.manager.id);
  const profitShare = fund.managerProfitSharePct ?? 0;

  return (
    <article className="border-primary/10 border-b py-5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <a
          href={`/funds/${fund.slug}`}
          className="group flex min-w-0 flex-1 items-center gap-2.5"
        >
          <h2 className="text-primary group-hover:text-primary/85 truncate text-lg font-semibold tracking-tight sm:text-xl">
            {fund.name}
          </h2>
        </a>

        <div className="text-primary/45 flex shrink-0 items-center gap-1.5 text-sm">
          {showAvatar ? (
            <a href={creatorPath(fund.manager.id)} className="shrink-0">
              <CreatorAvatar
                address={fund.manager.id}
                name={fund.manager.name}
                size="2xs"
              />
            </a>
          ) : (
            <div
              className="bg-primary/10 text-primary/70 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold"
              aria-hidden
            >
              {fund.manager.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}

          <a
            href={creatorPath(fund.manager.id)}
            className="text-primary/70 hover:text-primary inline-flex items-center gap-1 transition-colors"
          >
            {fund.manager.name}
            {fund.manager.verified && (
              <SealCheck size="xs" className="text-[#32BCFF]" />
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

      {snippet && (
        <a href={`/funds/${fund.slug}`} className="mt-1.5 block">
          <p className="text-primary/60 hover:text-primary/75 line-clamp-1 text-sm leading-snug transition-colors">
            {snippet}
          </p>
        </a>
      )}

      <a href={`/funds/${fund.slug}`} className="mt-4 block space-y-2">
        <FundStageMetricsRow fund={fund} profitUsdc={profitUsdc} />
        <PoolCapBar
          deposited={deposited}
          capUsdc={fund.capUsdc}
          trailing={<ProfitShareLabel pct={profitShare} />}
        />
      </a>
    </article>
  );
}
