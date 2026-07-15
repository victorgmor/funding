import type { Fund } from "@/lib/funds/types";
import { buildLifecycleStages, type LifecycleStageView } from "@/lib/funds/lifecycle";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";

type Props = { fund: Fund; variant?: "default" | "compact"; totalNotional?: number };

function StageIcon({ stage }: { stage: LifecycleStageView["id"] }) {
  if (stage === "deposit") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <path d="M4 2.5v9l7-4.5-7-4.5Z" fill="currentColor" />
      </svg>
    );
  }

  if (stage === "trading") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <path
          d="M3 11V7M6 11V4M9 11V6M12 11V3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <path
        d="M7 1.5 8.6 5h3.7l-3 2.2 1.1 3.5L7 8.5 3.6 10.7l1.1-3.5-3-2.2h3.7L7 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M5.2 8.8 6.4 10.2 8.9 7.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function StageDot({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "bg-[#32BCFF] size-2 shrink-0 rounded-full"
          : "bg-primary/30 size-2 shrink-0 rounded-full"
      }
    />
  );
}

function Connector() {
  return <div className="bg-primary/15 mx-2 hidden h-px min-w-6 flex-1 self-center sm:block" />;
}

function StageBlock({ stage }: { stage: LifecycleStageView }) {
  const active = stage.state === "current";
  const muted = stage.state === "future";

  const content = (
    <>
      <div className="flex items-center gap-2">
        <StageDot active={active} />
        <StageIcon stage={stage.id} />
        <p
          className={
            active
              ? "text-primary text-sm font-semibold"
              : muted
                ? "text-primary/35 text-sm font-medium"
                : "text-primary/55 text-sm font-medium"
          }
        >
          {stage.label}
        </p>
      </div>
      <p
        className={
          active
            ? "text-primary/70 mt-2 pl-4 text-xs"
            : muted
              ? "text-primary/30 mt-2 pl-4 text-xs"
              : "text-primary/45 mt-2 pl-4 text-xs"
        }
      >
        {stage.line1}
      </p>
      {stage.line2 && (
        <p className="text-[#32BCFF] mt-1 pl-4 text-xs">{stage.line2}</p>
      )}
    </>
  );

  if (active) {
    return (
      <div className="border-[#32BCFF]/50 bg-[#32BCFF]/10 min-w-0 flex-1 rounded-lg border px-4 py-3">
        {content}
      </div>
    );
  }

  return <div className="min-w-0 flex-1 px-1 py-3">{content}</div>;
}

function CompactStageRow({ stage }: { stage: LifecycleStageView }) {
  const active = stage.state === "current";
  const muted = stage.state === "future";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <StageDot active={active} />
        <span
          className={
            active
              ? "text-primary truncate text-sm font-semibold"
              : muted
                ? "text-primary/35 truncate text-sm"
                : "text-primary/55 truncate text-sm"
          }
        >
          {stage.label}
        </span>
      </div>
      <span
        className={`shrink-0 text-xs ${
          active ? "text-primary/70" : muted ? "text-primary/30" : "text-primary/45"
        }`}
      >
        {stage.line1}
      </span>
    </div>
  );
}

export default function FundLifecycleStepper({
  fund,
  variant = "default",
  totalNotional: totalNotionalProp,
}: Props) {
  const { totals } = usePoolTotals();
  const totalNotional =
    totalNotionalProp ?? totals[fund.slug]?.deposited ?? 0;
  const stages = buildLifecycleStages(fund, Date.now(), totalNotional);

  if (variant === "compact") {
    return (
      <div className="border-primary/10 divide-primary/10 mt-3.5 divide-y border-y">
        {stages.map((stage) => (
          <CompactStageRow key={stage.id} stage={stage} />
        ))}
      </div>
    );
  }

  return (
    <div className="border-primary/10 bg-primary/5 mt-6 rounded-lg border p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex min-w-0 flex-1 items-start">
            <StageBlock stage={stage} />
            {index < stages.length - 1 && <Connector />}
          </div>
        ))}
      </div>
    </div>
  );
}
