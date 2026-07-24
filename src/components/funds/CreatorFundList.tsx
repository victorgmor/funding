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
  "Deposited",
  "Fill %",
  "PnL",
  "Profit share",
  "Manager",
  "Published",
] as const;

export default function CreatorFundList({
  funds,
  initialPoolTotals,
}: Props) {
  const { totals: poolTotals } = usePoolTotals(initialPoolTotals);

  if (funds.length === 0) {
    return <p className="text-primary/50 text-sm">No funds yet.</p>;
  }

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="border-primary/10 min-w-[52rem] overflow-hidden rounded border">
        <div
          className={`${FUND_FEED_GRID} text-primary/45 py-1.5 text-[10px] font-medium tracking-wide uppercase`}
        >
          {HEADERS.map((label, i) => (
            <span
              key={label}
              className={i >= 2 && i <= 5 ? "text-right" : undefined}
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
            profitUsdc={poolTotals[fund.slug]?.profitUsdc ?? null}
          />
        ))}
      </div>
    </div>
  );
}
