import { fundListGridClass } from "@/components/funds/fund-list-layout";
import FundPerformanceCell from "@/components/funds/FundPerformanceCell";
import PoolCapBar from "@/components/funds/PoolCapBar";
import CurrencyDollarSimple from "@/components/fundations/icons/CurrencyDollarSimple";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import { isPaidFund } from "@/lib/funds/access";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  fund: Fund;
  deposited?: number;
  performance: FundPerformance | null;
};

function fundPriceLabel(fund: Fund): string {
  if (isPaidFund(fund)) return `$${fund.unlockPriceUsdc!.toFixed(2)}`;
  return "FREE";
}

export default function FundRow({ fund, deposited = 0, performance }: Props) {
  return (
    <article
      className={`bg-primary/5 hover:bg-primary/8 grid grid-cols-1 gap-3 rounded-lg px-4 py-3 transition-colors ${fundListGridClass}`}
    >
      <div className="min-w-0">
        <a
          href={`/funds/${fund.slug}`}
          className="text-primary hover:text-primary/80 flex min-w-0 items-center gap-2 font-medium"
        >
          {isPaidFund(fund) && (
            <CurrencyDollarSimple
              size="sm"
              className="text-accent shrink-0"
              aria-hidden
            />
          )}
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
          Pool
        </p>
        <PoolCapBar
          deposited={deposited}
          capUsdc={fund.capUsdc}
          variant="compact"
        />
      </div>

      <div className="min-w-0 lg:text-right">
        <p className="text-primary/50 mb-1 text-[0.65rem] font-medium uppercase lg:hidden">
          Performance
        </p>
        <FundPerformanceCell
          roi={performance?.roi ?? null}
          since={fund.createdAt}
        />
      </div>
    </article>
  );
}
