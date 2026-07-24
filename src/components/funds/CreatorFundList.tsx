import FundFeedCard, { FUND_FEED_GRID } from "@/components/funds/FundFeedCard";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { PoolTotalEntry } from "@/lib/funds/usePoolTotals";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  initialPoolTotals?: Record<string, PoolTotalEntry>;
};

const HEADERS = [
  "Fund",
  "Stage",
  "Manager",
  "Deposited",
  "Committed %",
  "Cap",
  "Profit share",
  "PnL",
  "Published",
] as const;

export default function CreatorFundList({
  funds,
  initialPoolTotals,
}: Props) {
  const { totals: poolTotals } = usePoolTotals(initialPoolTotals);

  if (funds.length === 0) {
    return <p className="text-primary/50 text-base">No funds yet.</p>;
  }

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="min-w-[56rem]">
        <div
          className={`${FUND_FEED_GRID} text-primary/45 border-primary/10 mb-1 border-b pb-2 text-base font-medium tracking-wide uppercase`}
          aria-hidden
        >
          {HEADERS.map((label) => (
            <span
              key={label}
              className={
                ["Deposited", "Committed %", "Cap", "Profit share", "PnL"].includes(
                  label,
                )
                  ? "text-right"
                  : undefined
              }
            >
              {label}
            </span>
          ))}
        </div>
        {funds.map((fund) => (
          <FundFeedCard
            key={fund.slug}
            fund={fund}
            deposited={poolTotals[fund.slug]?.deposited ?? 0}
            roiPct={poolTotals[fund.slug]?.roiPct ?? null}
          />
        ))}
      </div>
    </div>
  );
}
