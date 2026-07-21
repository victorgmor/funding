import FundFeedCard from "@/components/funds/FundFeedCard";
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
