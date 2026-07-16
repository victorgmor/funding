import CreatorAvatar from "@/components/creators/CreatorAvatar";
import { managersListGridClass } from "@/components/creators/managers-list-layout";
import PnlAmount from "@/components/funds/PnlAmount";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import type { TopCreator } from "@/lib/funds/creators";
import { formatUsdExact } from "@/lib/funds/format";

type Props = {
  managers: TopCreator[];
};

const headerClass =
  "text-primary/50 py-0 text-sm font-medium leading-none tracking-wide uppercase";

const cellLabelClass =
  "text-primary/50 mb-1 text-sm font-medium uppercase lg:hidden";

export default function TopManagersList({ managers }: Props) {
  if (managers.length === 0) {
    return (
      <p className="text-primary/50 text-sm">
        No managers with fund performance yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`px-4 pb-2 ${managersListGridClass} lg:items-baseline`}>
        <p className={headerClass}>Manager</p>
        <p className={`${headerClass} text-right lg:w-full`}>Funds</p>
        <p className={`${headerClass} text-right lg:w-full`}>Deposits</p>
        <p className={`${headerClass} text-right lg:w-full`}>PnL</p>
      </div>

      <div className="space-y-1">
        {managers.map((manager, index) => (
          <article
            key={manager.id}
            className={`bg-primary/5 hover:bg-primary/8 grid grid-cols-1 gap-3 rounded-lg px-4 py-3 transition-colors ${managersListGridClass}`}
          >
            <div className="min-w-0">
              <a
                href={creatorPath(manager.id)}
                className="hover:text-primary/80 flex min-w-0 items-center gap-4"
              >
                <span className="text-primary/40 w-6 shrink-0 text-center font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <CreatorAvatar
                  address={manager.id}
                  name={manager.name}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-primary truncate font-medium">
                      {manager.name}
                    </span>
                    {manager.verified && (
                      <SealCheck size="sm" className="text-[#32BCFF]" />
                    )}
                  </div>
                  <p className="text-primary/50 mt-0.5 text-xs lg:hidden">
                    {manager.fundCount} fund
                    {manager.fundCount === 1 ? "" : "s"}
                  </p>
                </div>
              </a>
            </div>

            <div className="min-w-0 lg:text-right">
              <p className={cellLabelClass}>Funds</p>
              <p className="text-primary/70 font-mono text-sm tabular-nums">
                {manager.fundCount}
              </p>
            </div>

            <div className="min-w-0 lg:text-right">
              <p className={cellLabelClass}>Deposits</p>
              <p className="text-primary/70 font-mono text-sm tabular-nums">
                {formatUsdExact(manager.totalDepositedUsdc)}
              </p>
            </div>

            <div className="min-w-0 lg:flex lg:justify-end">
              <p className={cellLabelClass}>PnL</p>
              <PnlAmount amount={manager.totalProfitUsdc} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
