import FundListColumnHeaders from "@/components/funds/FundListColumnHeaders";
import FundRow from "@/components/funds/FundRow";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  performanceBySlug: Record<string, FundPerformance | null>;
};

export default function CreatorFundList({ funds, performanceBySlug }: Props) {
  const { totals: poolTotals } = usePoolTotals();

  return (
    <div className="space-y-1">
      <FundListColumnHeaders />
      <div className="space-y-1">
        {funds.map((fund) => (
          <FundRow
            key={fund.slug}
            fund={fund}
            deposited={poolTotals[fund.slug] ?? 0}
            performance={performanceBySlug[fund.slug] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
