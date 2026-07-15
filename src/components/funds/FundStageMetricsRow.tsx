import PnlAmount from "@/components/funds/PnlAmount";
import FundLifecycleTrack from "@/components/funds/FundLifecycleTrack";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  profitUsdc: number | null;
  totalNotional?: number;
};

export default function FundStageMetricsRow({
  fund,
  profitUsdc,
  totalNotional = 0,
}: Props) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <FundLifecycleTrack fund={fund} totalNotional={totalNotional} />
      <PnlAmount amount={profitUsdc ?? 0} />
    </div>
  );
}
