import { capProgress, formatCapFillLabel, formatUsd } from "@/lib/funds/format";

type Props = {
  deposited: number;
  capUsdc?: number | null;
  variant?: "default" | "compact";
  className?: string;
};

export default function PoolCapBar({
  deposited,
  capUsdc,
  variant = "default",
  className = "",
}: Props) {
  const capped = capUsdc != null && capUsdc > 0;
  const pct = capped ? capProgress(deposited, capUsdc) : 0;
  const fillWidth = capped ? Math.max(pct, deposited > 0 ? 6 : 0) : 0;

  if (variant === "compact") {
    return (
      <div className={`min-w-0 ${className}`}>
        {capped && (
          <div className="bg-primary/10 mb-1.5 h-0.5 overflow-hidden rounded-full">
            <div
              className="bg-primary/40 h-full rounded-full transition-[width]"
              style={{ width: `${fillWidth}%` }}
            />
          </div>
        )}
        <p className="text-primary text-sm font-medium">
          <span className="font-mono tabular-nums">{formatUsd(deposited)}</span>
          <span className="text-primary/45 ml-1.5 text-xs font-normal">
            {formatCapFillLabel(deposited, capped ? capUsdc : null)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className={`max-w-xs ${className}`}>
      <div className="bg-primary/10 h-1 overflow-hidden rounded-full">
        {capped ? (
          <div
            className="bg-accent/75 h-full rounded-full transition-[width]"
            style={{ width: `${fillWidth}%` }}
          />
        ) : (
          deposited > 0 && (
            <div className="bg-primary/20 h-full w-full rounded-full" />
          )
        )}
      </div>
      <div className="text-primary/45 mt-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-mono tabular-nums">
          {formatUsd(deposited)} deposited
        </span>
        <span>{formatCapFillLabel(deposited, capped ? capUsdc : null)}</span>
      </div>
    </div>
  );
}
