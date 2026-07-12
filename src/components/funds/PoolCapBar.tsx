import type { ReactNode } from "react";
import { capProgress, formatCapFillLabel, formatUsdExact } from "@/lib/funds/format";

type Props = {
  deposited: number;
  capUsdc?: number | null;
  variant?: "default" | "compact";
  className?: string;
  primaryTrailing?: ReactNode;
  secondaryTrailing?: ReactNode;
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
          className="bg-accent/75 h-full transition-[width]"
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
  primaryTrailing,
  secondaryTrailing,
}: Props) {
  const capped = capUsdc != null && capUsdc > 0;
  const pct = capped ? capProgress(deposited, capUsdc) : 0;
  const fillWidth = capped ? Math.max(pct, deposited > 0 ? 6 : 0) : 0;
  const hasTrailing = primaryTrailing || secondaryTrailing;

  if (variant === "compact") {
    return (
      <div className={`min-w-0 ${className}`}>
        {capped && (
          <div className="bg-primary/10 mb-1.5 h-1 overflow-hidden">
            <div
              className="bg-primary/40 h-full transition-[width]"
              style={{ width: `${fillWidth}%` }}
            />
          </div>
        )}
        <p className="text-primary text-sm font-medium">
          <span className="font-mono tabular-nums">{formatUsdExact(deposited)}</span>
          <span className="text-primary/45 ml-1.5 text-xs font-normal">
            {formatCapFillLabel(deposited, capped ? capUsdc : null)}
          </span>
        </p>
      </div>
    );
  }

  const statsRow = (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-mono tabular-nums">
        <span className="text-primary/80 font-medium">
          {formatUsdExact(deposited)}
        </span>
        <span className="text-primary/45"> deposited</span>
      </span>
      <span className="text-primary/45">
        {formatCapFillLabel(deposited, capped ? capUsdc : null)}
      </span>
    </div>
  );

  if (!hasTrailing) {
    return (
      <div className={`min-w-0 ${className}`}>
        <ProgressTrack capped={capped} fillWidth={fillWidth} deposited={deposited} />
        <div className="mt-1.5">{statsRow}</div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1">
        <div className="flex min-h-5 items-center">
          <ProgressTrack capped={capped} fillWidth={fillWidth} deposited={deposited} />
        </div>
        <div className="flex min-h-5 items-center justify-end">
          {primaryTrailing}
        </div>
        <div className="min-h-5">{statsRow}</div>
        <div className="flex min-h-5 items-center justify-end">
          {secondaryTrailing}
        </div>
      </div>
    </div>
  );
}
