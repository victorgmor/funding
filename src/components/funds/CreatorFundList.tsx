import FundFeedCard, { FUND_FEED_GRID } from "@/components/funds/FundFeedCard";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { PoolTotalEntry } from "@/lib/funds/usePoolTotals";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  initialPoolTotals?: Record<string, PoolTotalEntry>;
};

export default function CreatorFundList({
  funds,
  initialPoolTotals,
}: Props) {
  const { totals: poolTotals } = usePoolTotals(initialPoolTotals);

  if (funds.length === 0) {
    return <p className="text-primary/50 text-sm">No funds yet.</p>;
  }

  return (
    <div>
      <div
        className={`${FUND_FEED_GRID} text-primary/45 border-primary/10 mb-1 border-b pb-2 text-sm`}
        aria-hidden
      >
        <span>Latest</span>
        <span>Managers</span>
        <span>Pool cap</span>
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
  );
}
