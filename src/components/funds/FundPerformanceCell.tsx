import { formatPercent, formatSinceDate, formatUsdExact } from "@/lib/funds/format";
import { useMandate } from "@/lib/funds/useMandate";

type Props = {
  fundSlug?: string;
  roi: number | null;
  since?: string;
  variant?: "row" | "header";
};

function ThesisRoi({
  roi,
  since,
  size = "row",
}: {
  roi: number;
  since?: string;
  size?: "row" | "header";
}) {
  const positive = roi >= 0;
  const color = positive ? "text-emerald-400" : "text-red-400";

  if (size === "header") {
    return (
      <div className="text-right">
        <p className={`font-mono text-lg font-medium tabular-nums ${color}`}>
          {formatPercent(roi)}
        </p>
        {since && (
          <p className="text-primary/45 mt-0.5 text-xs">
            since {formatSinceDate(since)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex min-w-[5rem] flex-col items-end py-1 lg:ml-auto">
      <p className={`font-mono text-sm font-semibold tabular-nums ${color}`}>
        {formatPercent(roi)}
      </p>
      {since && (
        <p className="text-primary/50 mt-0.5 text-[0.65rem]">
          since {formatSinceDate(since)}
        </p>
      )}
    </div>
  );
}

function FundPerformanceHeader({
  fundSlug,
  roi,
  since,
}: {
  fundSlug: string;
  roi: number | null;
  since?: string;
}) {
  const { mandate, committed } = useMandate(fundSlug);
  const position = committed && mandate ? mandate.notionalUsdc : null;

  if (roi == null && position == null) return null;

  return (
    <div className="shrink-0 text-right">
      {roi != null && <ThesisRoi roi={roi} since={since} size="header" />}
      {position != null && (
        <p className="text-primary/45 text-xs">
          Your mandate{" "}
          <span className="text-primary/80 font-mono font-medium tabular-nums">
            {formatUsdExact(position)}
          </span>
        </p>
      )}
    </div>
  );
}

export default function FundPerformanceCell({
  fundSlug,
  roi,
  since,
  variant = "row",
}: Props) {
  if (variant === "row") {
    if (roi == null) {
      return <span className="text-primary/30 text-sm">—</span>;
    }
    return <ThesisRoi roi={roi} since={since} size="row" />;
  }

  if (!fundSlug) return null;

  return (
    <FundPerformanceHeader fundSlug={fundSlug} roi={roi} since={since} />
  );
}
