import {
  daysSince,
  daysUntil,
  effectiveClosedAt,
  poolCapReached,
  resolveLifecycleStage,
  type LifecycleStage,
} from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";

const LABELS: Record<LifecycleStage, string> = {
  deposit: "Deposit stage",
  trading: "Trading stage",
  closed: "Closed stage",
};

const COMPACT_LABELS: Record<LifecycleStage, string> = {
  deposit: "Deposit",
  trading: "Trading",
  closed: "Closed",
};

const DOT_COLORS: Record<LifecycleStage, string> = {
  deposit: "bg-primary",
  trading: "bg-[#32BCFF]",
  closed: "bg-red-400",
};

function stageTiming(
  fund: Fund,
  stage: LifecycleStage,
  totalNotional = 0,
  compact = false,
): string | null {
  if (stage === "deposit" && fund.raiseEndsAt) {
    const days = daysUntil(fund.raiseEndsAt);
    if (days === 0) return compact ? "today" : "Ends today";
    return compact
      ? `${days}d`
      : `${days} ${days === 1 ? "day" : "days"} left`;
  }

  if (stage === "trading" && fund.tradingEndsAt) {
    const days = daysUntil(fund.tradingEndsAt);
    if (days === 0) return compact ? "today" : "Ends today";
    return compact
      ? `${days}d`
      : `${days} ${days === 1 ? "day" : "days"} left`;
  }

  if (
    stage === "trading" &&
    fund.raiseEndsAt &&
    poolCapReached(fund, totalNotional) &&
    Date.parse(fund.raiseEndsAt) > Date.now()
  ) {
    return "Cap reached";
  }

  if (stage === "closed") {
    const closedAt = effectiveClosedAt(fund);
    if (!closedAt) return null;
    const ago = daysSince(closedAt);
    if (ago === 0) return compact ? "today" : "Closed today";
    return compact
      ? `${ago}d ago`
      : `Closed ${ago} ${ago === 1 ? "day" : "days"} ago`;
  }

  return null;
}

type Props = { fund: Fund; totalNotional?: number; compact?: boolean };

export default function FundLifecycleTrack({
  fund,
  totalNotional = 0,
  compact = false,
}: Props) {
  const stage = resolveLifecycleStage(fund, Date.now(), totalNotional);
  const timing = stageTiming(fund, stage, totalNotional, compact);
  const label = compact ? COMPACT_LABELS[stage] : LABELS[stage];

  return (
    <div
      className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}
      aria-label="Fund lifecycle"
    >
      <span
        className={`${DOT_COLORS[stage]} size-2 shrink-0 rounded-full`}
        aria-hidden
      />
      <p
        className={`text-primary min-w-0 whitespace-nowrap ${
          compact ? "text-[11px] font-medium" : "text-sm font-medium"
        }`}
      >
        {label}
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
