import {
  daysSince,
  daysUntil,
  effectiveClosedAt,
  resolveLifecycleStage,
  type LifecycleStage,
} from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";

const LABELS: Record<LifecycleStage, string> = {
  deposit: "Deposit stage",
  trading: "Trading stage",
  closed: "Closed stage",
};

function stageTiming(fund: Fund, stage: LifecycleStage): string | null {
  if (stage === "deposit" && fund.raiseEndsAt) {
    const days = daysUntil(fund.raiseEndsAt);
    if (days === 0) return "Ends today";
    return `${days} ${days === 1 ? "day" : "days"} left`;
  }

  if (stage === "trading" && fund.tradingEndsAt) {
    const days = daysUntil(fund.tradingEndsAt);
    if (days === 0) return "Ends today";
    return `${days} ${days === 1 ? "day" : "days"} left`;
  }

  if (stage === "closed") {
    const closedAt = effectiveClosedAt(fund);
    if (!closedAt) return null;
    const ago = daysSince(closedAt);
    if (ago === 0) return "Closed today";
    return `Closed ${ago} ${ago === 1 ? "day" : "days"} ago`;
  }

  return null;
}

type Props = { fund: Fund };

export default function FundLifecycleTrack({ fund }: Props) {
  const stage = resolveLifecycleStage(fund);
  const timing = stageTiming(fund, stage);

  return (
    <div
      className="flex min-w-0 items-center gap-2"
      aria-label="Fund lifecycle"
    >
      <span
        className="bg-[#32BCFF] size-2 shrink-0 rounded-full"
        aria-hidden
      />
      <p className="text-primary min-w-0 text-sm font-medium">
        {LABELS[stage]}
        {timing && (
          <>
            <span className="text-primary/45" aria-hidden>
              {" "}
              ·{" "}
            </span>
            <span className="text-primary/70 font-normal">{timing}</span>
          </>
        )}
      </p>
    </div>
  );
}
