import {
  fundListGridClass,
  fundListTrailingClass,
} from "@/components/funds/fund-list-layout";
import FundPerformanceCell from "@/components/funds/FundPerformanceCell";
import Eye from "@/components/fundations/icons/Eye";
import LockOpen from "@/components/fundations/icons/LockOpen";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import { isPaidFund } from "@/lib/funds/access";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  performance: FundPerformance | null;
};

function fundPriceLabel(fund: Fund): string {
  if (isPaidFund(fund)) return `$${fund.unlockPriceUsdc!.toFixed(2)}`;
  return "FREE";
}

export default function FundRow({ fund, performance }: Props) {
  return (
    <article
      className={`bg-primary/5 hover:bg-primary/8 grid grid-cols-1 gap-3 rounded-lg px-4 py-3 transition-colors ${fundListGridClass}`}
    >
      <div className="min-w-0">
        <a
          href={`/funds/${fund.slug}`}
          className="text-primary hover:text-primary/80 font-medium"
        >
          <span className="truncate">{fund.name}</span>
        </a>
        <p className="text-primary/60 mt-0.5 line-clamp-1 text-xs">
          {fund.description}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
          Creator
        </p>
        <div className="flex items-center gap-2">
          <a
            href={creatorPath(fund.manager.id)}
            className="text-primary hover:text-primary/80 truncate text-sm"
          >
            {fund.manager.name}
          </a>
          {fund.manager.verified && (
            <SealCheck size="sm" className="text-[#32BCFF]" />
          )}
        </div>
      </div>

      <div className="min-w-0 lg:text-center">
        <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
          Price
        </p>
        <p
          className={`inline-block min-w-[3.25rem] font-mono text-sm font-medium tabular-nums ${
            isPaidFund(fund) ? "text-primary" : "text-primary/50"
          }`}
        >
          {fundPriceLabel(fund)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
          Markets
        </p>
        <p className="text-primary text-sm font-medium">
          {fund.markets.length} markets
        </p>
      </div>

      <div className={fundListTrailingClass}>
        <div className="min-w-0 text-right">
          <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
            Thesis ROI
          </p>
          <FundPerformanceCell
            roi={performance?.roi ?? null}
            since={fund.createdAt}
          />
        </div>
        <div className="flex flex-col items-center">
          <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
            Access
          </p>
          <a
            href={`/funds/${fund.slug}`}
            aria-label={isPaidFund(fund) ? "Unlock bundle" : "View bundle"}
            className="text-primary hover:text-primary/70 inline-flex shrink-0 items-center justify-center transition-colors"
          >
            {isPaidFund(fund) ? (
              <LockOpen size="sm" aria-hidden />
            ) : (
              <Eye size="sm" aria-hidden />
            )}
          </a>
        </div>
      </div>
    </article>
  );
}
