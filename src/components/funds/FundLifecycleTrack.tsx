import { resolveLifecycleStage, type LifecycleStage } from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";

const LABELS: Record<LifecycleStage, string> = {
  deposit: "Deposit stage",
  trading: "Trading stage",
  closed: "Closed stage",
};

type Props = { fund: Fund };

export default function FundLifecycleTrack({ fund }: Props) {
  const stage = resolveLifecycleStage(fund);

  return (
    <p className="text-primary text-sm font-medium" aria-label="Fund lifecycle">
      {LABELS[stage]}
    </p>
  );
}
