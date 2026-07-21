import PoolCapBar from "@/components/funds/PoolCapBar";
import PnlAmount from "@/components/funds/PnlAmount";
import { formatPercent, formatPublishedAgo, formatUsd } from "@/lib/funds/format";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  performanceBySlug: Record<string, FundPerformance | null>;
};

const gridClass =
  "lg:grid lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] lg:items-center lg:gap-x-6";

const headerClass =
  "text-primary/45 text-xs font-medium tracking-wide uppercase";

function feesFor(
  fund: Fund,
  performance: FundPerformance | null,
): number {
  if (!performance || performance.profitUsdc <= 0) return 0;
  const share = fund.managerProfitSharePct ?? 0;
  return Math.round(performance.profitUsdc * (share / 100) * 100) / 100;
}

function statusLabel(fund: Fund): string {
  if (fund.status === "archived") return "Archived";
  if (fund.status === "closed") return "Closed";
  return "Trading";
}

export default function CreatorFundList({ funds, performanceBySlug }: Props) {
  const { totals: poolTotals } = usePoolTotals();

  if (funds.length === 0) {
    return <p className="text-primary/50 text-sm">No funds yet.</p>;
  }

  return (
    <div>
      <div className={`hidden px-1 pb-3 ${gridClass} lg:grid`}>
        <p className={headerClass}>Fund</p>
        <p className={`${headerClass} text-right`}>Deposits</p>
        <p className={`${headerClass} text-right`}>Balance</p>
        <p className={`${headerClass} text-right`}>Performance</p>
        <p className={`${headerClass} text-right`}>Fees earned</p>
      </div>

      <div className="border-primary/10 divide-primary/10 divide-y border-t">
        {funds.map((fund) => {
          const performance = performanceBySlug[fund.slug] ?? null;
          const deposited =
            performance?.depositedUsdc ??
            poolTotals[fund.slug]?.deposited ??
            0;
          const balance =
            performance?.aumUsdc ??
            (performance
              ? deposited + performance.profitUsdc
              : deposited);
          const profit = performance?.profitUsdc ?? 0;
          const roi = performance?.roi ?? null;
          const fees = feesFor(fund, performance);
          const share = fund.managerProfitSharePct ?? 0;
          const published = formatPublishedAgo(fund.createdAt);

          return (
            <article key={fund.slug} className={`py-4 ${gridClass}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/funds/${fund.slug}`}
                    className="text-primary hover:text-primary/80 truncate font-medium"
                  >
                    {fund.name}
                  </a>
                  <span className="text-primary/50 border-primary/15 rounded-full border px-2 py-0.5 text-xs">
                    {statusLabel(fund)}
                  </span>
                </div>
                <p className="text-primary/50 mt-1 text-xs">
                  0% entry / {share}% profit
                  {published ? ` · ${published}` : ""}
                </p>
              </div>

              <div className="mt-3 min-w-0 lg:mt-0 lg:text-right">
                <p className={`${headerClass} mb-1 lg:hidden`}>Deposits</p>
                <p className="text-primary font-mono text-sm tabular-nums">
                  {formatUsd(deposited)}
                </p>
                <div className="mt-1.5 lg:ml-auto lg:max-w-[9rem]">
                  <PoolCapBar
                    deposited={deposited}
                    capUsdc={fund.capUsdc}
                    variant="compact"
                  />
                </div>
              </div>

              <div className="mt-3 min-w-0 lg:mt-0 lg:text-right">
                <p className={`${headerClass} mb-1 lg:hidden`}>Balance</p>
                <p className="text-primary font-mono text-sm tabular-nums">
                  {formatUsd(balance)}
                </p>
              </div>

              <div className="mt-3 min-w-0 lg:mt-0 lg:text-right">
                <p className={`${headerClass} mb-1 lg:hidden`}>Performance</p>
                <PnlAmount amount={profit} />
                {roi != null && (
                  <p
                    className={`mt-0.5 font-mono text-xs tabular-nums ${
                      roi >= 0 ? "text-profit" : "text-red-500"
                    }`}
                  >
                    {formatPercent(roi)}
                  </p>
                )}
              </div>

              <div className="mt-3 min-w-0 lg:mt-0 lg:text-right">
                <p className={`${headerClass} mb-1 lg:hidden`}>Fees earned</p>
                <p className="text-primary font-mono text-sm tabular-nums">
                  {formatUsd(fees)}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
