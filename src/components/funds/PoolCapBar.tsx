import type { ReactNode } from "react";
import { capProgress, formatCapFillLabel, formatUsdExact } from "@/lib/funds/format";

type Props = {
  deposited: number;
  capUsdc?: number | null;
  variant?: "default" | "compact";
  className?: string;
  trailing?: ReactNode;
};

function ProgressTrack({
  capped,
  fillWidth,
  deposited,
}: {
  capped: boolean;
  fillWidth: number;
  deposited: number;
}) {
  return (
    <div className="bg-primary/10 h-2 w-full overflow-hidden">
      {capped ? (
        <div
          className="bg-primary h-full transition-[width]"
          style={{ width: `${fillWidth}%` }}
        />
      ) : (
        deposited > 0 && (
          <div className="bg-primary/20 h-full w-full" />
        )
      )}
    </div>
  );
}

export default function PoolCapBar({
  deposited,
  capUsdc,
  variant = "default",
  className = "",
  trailing,
}: Props) {
  const capped = capUsdc != null && capUsdc > 0;
  const pct = capped ? capProgress(deposited, capUsdc) : 0;
  const fillWidth = capped ? Math.max(pct, deposited > 0 ? 6 : 0) : 0;

  if (variant === "compact") {
    return (
      <div className={`min-w-0 ${className}`}>
        {capped && (
          <div className="bg-primary/10 mb-1.5 h-1 overflow-hidden">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${fillWidth}%` }}
            />
          </div>
        )}
        <p className="text-primary text-base font-medium">
          <span className="font-mono tabular-nums">{formatUsdExact(deposited)}</span>
          <span className="text-primary/45 ml-1.5 text-base font-normal">
            {formatCapFillLabel(deposited, capped ? capUsdc : null)}
          </span>
        </p>
      </div>
    );
  }

  const statsLine = (
    <p className="min-w-0 text-base font-mono tabular-nums">
      <span className="text-primary/80 font-medium">
        {formatUsdExact(deposited)}
      </span>
      <span className="text-primary/45">
        {" "}
        deposited · {formatCapFillLabel(deposited, capped ? capUsdc : null)}
      </span>
    </p>
  );

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-6">
        {statsLine}
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      <ProgressTrack capped={capped} fillWidth={fillWidth} deposited={deposited} />
    </div>
  );
}
