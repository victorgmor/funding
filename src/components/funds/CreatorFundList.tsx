import FundRow from "@/components/funds/FundRow";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  performanceBySlug: Record<string, FundPerformance | null>;
};

export default function CreatorFundList({ funds, performanceBySlug }: Props) {
  return (
    <div className="space-y-2">
      {funds.map((fund) => (
        <FundRow
          key={fund.slug}
          fund={fund}
          performance={performanceBySlug[fund.slug] ?? null}
        />
      ))}
    </div>
  );
}
