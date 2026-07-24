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
  const color = positive ? "text-profit" : "text-red-500";

  if (size === "header") {
    return (
      <div className="flex flex-col items-end justify-center text-right leading-none">
        <p className={`font-mono text-lg font-medium tabular-nums ${color}`}>
          {formatPercent(roi)}
        </p>
        {since && (
          <p className="text-primary/45 mt-1 text-base leading-none">
            since {formatSinceDate(since)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex min-w-[5rem] flex-col items-end justify-center leading-none lg:ml-auto">
      <p className={`font-mono text-base font-semibold tabular-nums ${color}`}>
        {formatPercent(roi)}
      </p>
      {since && (
        <p className="text-primary/50 mt-1 text-base leading-none">
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
  const { mandate, mandateValueUsdc, committed } = useMandate(fundSlug);
  const position =
    committed && mandate
      ? (mandateValueUsdc ?? mandate.notionalUsdc)
      : null;

  if (roi == null && position == null) return null;

  return (
    <div className="flex shrink-0 flex-col items-end justify-center text-right">
      {roi != null && <ThesisRoi roi={roi} since={since} size="header" />}
      {position != null && (
        <p className="text-primary/45 mt-1 text-base leading-none">
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
      return <span className="text-primary/30 text-base">—</span>;
    }
    return <ThesisRoi roi={roi} since={since} size="row" />;
  }

  if (!fundSlug) return null;

  return (
    <FundPerformanceHeader fundSlug={fundSlug} roi={roi} since={since} />
  );
}
